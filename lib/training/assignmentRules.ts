import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type {
  Profile,
  TrainingAssignmentRule,
  TrainingModule,
} from "@/types/supabase";

export type AssignmentRuleTriggerType =
  | "hire"
  | "position_change"
  | "location_change"
  | "manual";

type SupabaseAdminClient = ReturnType<typeof createAdminSupabaseClient>;

type ApplyAssignmentRulesOptions = {
  supabase?: SupabaseAdminClient;
  assignedBy?: string | null;
};

type EmployeeRuleContext = {
  employee: Profile;
  positionIds: Set<string>;
};

export type ApplyAssignmentRulesResult = {
  employeeCount: number;
  matchedRuleCount: number;
  createdAssignmentCount: number;
  skippedDuplicateCount: number;
};

function getTriggerColumn(triggerType: AssignmentRuleTriggerType) {
  if (triggerType === "hire") return "assign_on_hire";
  if (triggerType === "position_change") return "assign_on_position_change";
  if (triggerType === "location_change") return "assign_on_location_change";

  return null;
}

function addDays(date: Date, days: number) {
  const dueDate = new Date(date);
  dueDate.setDate(dueDate.getDate() + days);
  return dueDate.toISOString();
}

function getRuleDaysAllowed(
  rule: Pick<TrainingAssignmentRule, "days_allowed" | "module_id">,
  moduleById: Map<string, Pick<TrainingModule, "id" | "days_allowed">>
) {
  return rule.days_allowed ?? moduleById.get(rule.module_id)?.days_allowed ?? null;
}

function ruleMatchesEmployee(
  rule: TrainingAssignmentRule,
  context: EmployeeRuleContext
) {
  if (rule.rule_type === "all_employees") return true;

  if (rule.rule_type === "position") {
    return Boolean(rule.position_id && context.positionIds.has(rule.position_id));
  }

  if (rule.rule_type === "location") {
    return Boolean(
      rule.location_id && rule.location_id === context.employee.location_id
    );
  }

  return Boolean(
    rule.position_id &&
      context.positionIds.has(rule.position_id) &&
      rule.location_id &&
      rule.location_id === context.employee.location_id
  );
}

async function fetchEmployeeRuleContext(
  supabase: SupabaseAdminClient,
  employeeId: string
) {
  const { data: employee, error: employeeError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", employeeId)
    .maybeSingle();

  if (employeeError) throw employeeError;
  if (!employee) return null;

  const { data: positions, error: positionsError } = await supabase
    .from("employee_positions")
    .select("position_id")
    .eq("employee_id", employeeId);

  if (positionsError) throw positionsError;

  return {
    employee,
    positionIds: new Set((positions ?? []).map((position) => position.position_id)),
  } satisfies EmployeeRuleContext;
}

async function fetchActiveRules(
  supabase: SupabaseAdminClient,
  companyId: string,
  triggerType: AssignmentRuleTriggerType
) {
  let query = supabase
    .from("training_assignment_rules")
    .select("*")
    .eq("company_id", companyId)
    .eq("is_active", true);

  const triggerColumn = getTriggerColumn(triggerType);

  if (triggerColumn) {
    query = query.eq(triggerColumn, true);
  }

  const { data, error } = await query;

  if (error) throw error;

  return data ?? [];
}

async function fetchModuleDaysAllowed(
  supabase: SupabaseAdminClient,
  companyId: string,
  moduleIds: string[]
) {
  if (moduleIds.length === 0) return new Map<string, TrainingModule>();

  const { data, error } = await supabase
    .from("training_modules")
    .select("id,days_allowed")
    .eq("company_id", companyId)
    .in("id", moduleIds);

  if (error) throw error;

  return new Map((data ?? []).map((module) => [module.id, module]));
}

export async function applyAssignmentRulesForEmployee(
  employeeId: string,
  triggerType: AssignmentRuleTriggerType,
  options: ApplyAssignmentRulesOptions = {}
): Promise<ApplyAssignmentRulesResult> {
  const supabase = options.supabase ?? createAdminSupabaseClient();
  const context = await fetchEmployeeRuleContext(supabase, employeeId);

  if (!context || !context.employee.is_active) {
    return {
      employeeCount: 0,
      matchedRuleCount: 0,
      createdAssignmentCount: 0,
      skippedDuplicateCount: 0,
    };
  }

  const rules = await fetchActiveRules(
    supabase,
    context.employee.company_id,
    triggerType
  );
  const matchingRules = rules.filter((rule) => ruleMatchesEmployee(rule, context));
  const moduleIds = Array.from(new Set(matchingRules.map((rule) => rule.module_id)));

  if (moduleIds.length === 0) {
    return {
      employeeCount: 1,
      matchedRuleCount: 0,
      createdAssignmentCount: 0,
      skippedDuplicateCount: 0,
    };
  }

  const [modulesById, existingAssignmentsResult] = await Promise.all([
    fetchModuleDaysAllowed(supabase, context.employee.company_id, moduleIds),
    supabase
      .from("training_assignments")
      .select("module_id")
      .eq("employee_id", employeeId)
      .in("module_id", moduleIds),
  ]);

  if (existingAssignmentsResult.error) throw existingAssignmentsResult.error;

  const existingModuleIds = new Set(
    (existingAssignmentsResult.data ?? []).map((assignment) => assignment.module_id)
  );
  const createdModuleIds = new Set<string>();
  const now = new Date();
  const insertRows = matchingRules.flatMap((rule) => {
    if (existingModuleIds.has(rule.module_id) || createdModuleIds.has(rule.module_id)) {
      return [];
    }

    createdModuleIds.add(rule.module_id);
    const daysAllowed = getRuleDaysAllowed(rule, modulesById);

    return [
      {
        employee_id: employeeId,
        module_id: rule.module_id,
        status: "not_started" as const,
        progress_percent: 0,
        started_at: null,
        completed_at: null,
        latest_score: null,
        passed: false,
        assigned_by: options.assignedBy ?? rule.created_by ?? null,
        due_date: daysAllowed ? addDays(now, daysAllowed) : null,
      },
    ];
  });
  let createdAssignmentCount = 0;

  if (insertRows.length > 0) {
    const { data: insertedAssignments, error: insertError } = await supabase
      .from("training_assignments")
      .upsert(insertRows, {
        onConflict: "employee_id,module_id",
        ignoreDuplicates: true,
      })
      .select("module_id");

    if (insertError) throw insertError;

    createdAssignmentCount = insertedAssignments?.length ?? 0;
  }

  return {
    employeeCount: 1,
    matchedRuleCount: matchingRules.length,
    createdAssignmentCount,
    skippedDuplicateCount: matchingRules.length - createdAssignmentCount,
  };
}

export async function applyAssignmentRulesForEmployees(
  employeeIds: string[],
  triggerType: AssignmentRuleTriggerType,
  options: ApplyAssignmentRulesOptions = {}
): Promise<ApplyAssignmentRulesResult> {
  const supabase = options.supabase ?? createAdminSupabaseClient();
  const totals: ApplyAssignmentRulesResult = {
    employeeCount: 0,
    matchedRuleCount: 0,
    createdAssignmentCount: 0,
    skippedDuplicateCount: 0,
  };

  for (const employeeId of employeeIds) {
    const result = await applyAssignmentRulesForEmployee(employeeId, triggerType, {
      ...options,
      supabase,
    });

    totals.employeeCount += result.employeeCount;
    totals.matchedRuleCount += result.matchedRuleCount;
    totals.createdAssignmentCount += result.createdAssignmentCount;
    totals.skippedDuplicateCount += result.skippedDuplicateCount;
  }

  return totals;
}
