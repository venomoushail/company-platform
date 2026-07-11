import { NextResponse } from "next/server";
import { requireAdminAreaContext, jsonError } from "@/lib/auth/api";
import type {
  Location,
  Position,
  Profile,
  TrainingAssignmentRule,
  TrainingAssignmentRuleType,
  TrainingModule,
} from "@/types/supabase";
import type { DataScope } from "@/lib/auth/scope";
import { canAccessEmployee } from "@/lib/auth/scope";

export const dynamic = "force-dynamic";

const ruleTypes = new Set<TrainingAssignmentRuleType>([
  "all_employees",
  "position",
  "location",
  "position_location",
]);

type AssignmentRulePayload = {
  id?: unknown;
  module_id?: unknown;
  rule_type?: unknown;
  position_id?: unknown;
  location_id?: unknown;
  assign_on_hire?: unknown;
  assign_on_position_change?: unknown;
  assign_on_location_change?: unknown;
  days_allowed?: unknown;
  is_active?: unknown;
};

type AssignmentRuleWithDetails = TrainingAssignmentRule & {
  module: Pick<TrainingModule, "id" | "title" | "status"> | null;
  position: Pick<Position, "id" | "name"> | null;
  location: Pick<Location, "id" | "name" | "store_number"> | null;
  current_match_count: number;
};

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readOptionalString(value: unknown) {
  const stringValue = readString(value);
  return stringValue || null;
}

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function readPositiveInteger(value: unknown) {
  if (value === undefined || value === null || value === "") return null;

  const parsedValue =
    typeof value === "number" ? value : Number(readString(value));

  if (!Number.isFinite(parsedValue)) return null;

  return Math.trunc(parsedValue);
}

function validateRulePayload(payload: AssignmentRulePayload) {
  const fieldErrors: Partial<Record<string, string>> = {};
  const moduleId = readString(payload.module_id);
  const rawRuleType = readString(payload.rule_type) as TrainingAssignmentRuleType;
  const ruleType = ruleTypes.has(rawRuleType) ? rawRuleType : "all_employees";
  const includesPosition =
    ruleType === "position" || ruleType === "position_location";
  const includesLocation =
    ruleType === "location" || ruleType === "position_location";
  const positionId = includesPosition ? readOptionalString(payload.position_id) : null;
  const locationId = includesLocation ? readOptionalString(payload.location_id) : null;
  const daysAllowed = readPositiveInteger(payload.days_allowed);

  if (!moduleId) fieldErrors.module_id = "Choose a training module.";
  if (!ruleTypes.has(rawRuleType)) fieldErrors.rule_type = "Choose a rule type.";

  if (includesPosition && !positionId) {
    fieldErrors.position_id = "Choose a position.";
  }

  if (includesLocation && !locationId) {
    fieldErrors.location_id = "Choose a location.";
  }

  if (
    payload.days_allowed !== undefined &&
    payload.days_allowed !== null &&
    payload.days_allowed !== "" &&
    (daysAllowed === null || daysAllowed < 1)
  ) {
    fieldErrors.days_allowed = "Days allowed must be greater than 0.";
  }

  return {
    values: {
      moduleId,
      ruleType,
      positionId,
      locationId,
      assignOnHire: readBoolean(payload.assign_on_hire, true),
      assignOnPositionChange: readBoolean(
        payload.assign_on_position_change,
        true
      ),
      assignOnLocationChange: readBoolean(payload.assign_on_location_change, true),
      daysAllowed,
      isActive: readBoolean(payload.is_active, true),
    },
    fieldErrors,
  };
}

async function validateCompanyReferences(
  supabase: NonNullable<
    Awaited<ReturnType<typeof requireAdminAreaContext>>["supabase"]
  >,
  companyId: string,
  values: ReturnType<typeof validateRulePayload>["values"],
  requireActiveTargets = false
) {
  const [moduleResult, positionResult, locationResult] = await Promise.all([
    supabase
      .from("training_modules")
      .select("id")
      .eq("id", values.moduleId)
      .eq("company_id", companyId)
      .in("status", ["draft", "published"])
      .maybeSingle(),
    values.positionId
      ? supabase
          .from("positions")
          .select("id,is_active")
          .eq("id", values.positionId)
          .eq("company_id", companyId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    values.locationId
      ? supabase
          .from("locations")
          .select("id,is_active")
          .eq("id", values.locationId)
          .eq("company_id", companyId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (moduleResult.error || positionResult.error || locationResult.error) {
    console.error("[assignment-rules] Reference validation failed", {
      moduleError: moduleResult.error,
      positionError: positionResult.error,
      locationError: locationResult.error,
    });
    return { response: jsonError("Unable to validate rule references.", 500) };
  }

  const fieldErrors: Partial<Record<string, string>> = {};

  if (!moduleResult.data) {
    fieldErrors.module_id = "Choose a draft or published company training.";
  }

  if (values.positionId && !positionResult.data) {
    fieldErrors.position_id = "Choose a company position.";
  }

  if (values.locationId && !locationResult.data) {
    fieldErrors.location_id = "Choose a company location.";
  }

  if (
    requireActiveTargets &&
    positionResult.data &&
    !positionResult.data.is_active
  ) {
    fieldErrors.position_id = "Choose an active company position.";
  }

  if (
    requireActiveTargets &&
    locationResult.data &&
    !locationResult.data.is_active
  ) {
    fieldErrors.location_id = "Choose an active company location.";
  }

  return {
    response:
      Object.keys(fieldErrors).length > 0
        ? jsonError("Fix the highlighted fields.", 400, fieldErrors)
        : null,
  };
}

function buildRulePayload(
  values: ReturnType<typeof validateRulePayload>["values"]
) {
  return {
    module_id: values.moduleId,
    rule_type: values.ruleType,
    position_id: values.positionId,
    location_id: values.locationId,
    assign_on_hire: values.assignOnHire,
    assign_on_position_change: values.assignOnPositionChange,
    assign_on_location_change: values.assignOnLocationChange,
    days_allowed: values.daysAllowed,
    is_active: values.isActive,
    updated_at: new Date().toISOString(),
  };
}

async function fetchRulesWithDetails(
  supabase: NonNullable<
    Awaited<ReturnType<typeof requireAdminAreaContext>>["supabase"]
  >,
  scope: DataScope,
  moduleId: string | null = null
) {
  let rulesQuery = supabase
    .from("training_assignment_rules")
    .select("*")
    .eq("company_id", scope.companyId)
    .order("created_at", { ascending: false });

  if (moduleId) {
    rulesQuery = rulesQuery.eq("module_id", moduleId);
  }

  const [rulesResult, modulesResult, positionsResult, locationsResult] =
    await Promise.all([
      rulesQuery,
      supabase
        .from("training_modules")
        .select("id,title,status")
        .eq("company_id", scope.companyId)
        .in("status", ["draft", "published"])
        .order("title", { ascending: true }),
      supabase
        .from("positions")
        .select("*")
        .eq("company_id", scope.companyId)
        .order("name", { ascending: true }),
      supabase
        .from("locations")
        .select("*")
        .eq("company_id", scope.companyId)
        .order("store_number", { ascending: true }),
    ]);

  if (
    rulesResult.error ||
    modulesResult.error ||
    positionsResult.error ||
    locationsResult.error
  ) {
    console.error("[assignment-rules] Fetch failed", {
      rulesError: rulesResult.error,
      modulesError: modulesResult.error,
      positionsError: positionsResult.error,
      locationsError: locationsResult.error,
    });
    return {
      response: jsonError("Unable to load assignment rules.", 500),
      data: null,
    };
  }

  const modules = modulesResult.data ?? [];
  const positions = positionsResult.data ?? [];
  const locations = locationsResult.data ?? [];
  const moduleById = new Map(modules.map((module) => [module.id, module]));
  const positionById = new Map(positions.map((position) => [position.id, position]));
  const locationById = new Map(locations.map((location) => [location.id, location]));
  const matchCounts = await getRuleMatchCounts(
    supabase,
    scope,
    rulesResult.data ?? []
  );
  const rules = (rulesResult.data ?? []).map<AssignmentRuleWithDetails>((rule) => ({
    ...rule,
    module: moduleById.get(rule.module_id) ?? null,
    position: rule.position_id ? positionById.get(rule.position_id) ?? null : null,
    location: rule.location_id ? locationById.get(rule.location_id) ?? null : null,
    current_match_count: matchCounts.get(rule.id) ?? 0,
  }));

  return {
    response: null,
    data: {
      rules,
      modules,
      positions,
      locations,
    },
  };
}

function ruleMatchesEmployee(
  rule: TrainingAssignmentRule,
  employee: Profile,
  positionIds: Set<string>
) {
  if (rule.rule_type === "all_employees") return true;
  if (rule.rule_type === "position") {
    return Boolean(rule.position_id && positionIds.has(rule.position_id));
  }
  if (rule.rule_type === "location") {
    return Boolean(rule.location_id && rule.location_id === employee.location_id);
  }

  return Boolean(
    rule.position_id &&
      positionIds.has(rule.position_id) &&
      rule.location_id &&
      rule.location_id === employee.location_id
  );
}

async function getRuleMatchCounts(
  supabase: NonNullable<
    Awaited<ReturnType<typeof requireAdminAreaContext>>["supabase"]
  >,
  scope: DataScope,
  rules: TrainingAssignmentRule[]
) {
  const counts = new Map<string, number>();

  if (rules.length === 0) return counts;

  const [{ data: employees, error: employeesError }, positionsResult] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("*")
        .eq("company_id", scope.companyId)
        .eq("is_active", true),
      supabase.from("employee_positions").select("employee_id,position_id"),
    ]);

  if (employeesError || positionsResult.error) {
    console.error("[assignment-rules] Match count lookup failed", {
      employeesError,
      positionsError: positionsResult.error,
    });
    return counts;
  }

  const positionsByEmployee = new Map<string, Set<string>>();

  for (const position of positionsResult.data ?? []) {
    const existing = positionsByEmployee.get(position.employee_id) ?? new Set<string>();
    existing.add(position.position_id);
    positionsByEmployee.set(position.employee_id, existing);
  }

  const scopedEmployees = (employees ?? []).filter((employee) =>
    canAccessEmployee(scope, employee)
  );

  for (const rule of rules) {
    counts.set(
      rule.id,
      scopedEmployees.filter((employee) =>
        ruleMatchesEmployee(
          rule,
          employee,
          positionsByEmployee.get(employee.id) ?? new Set<string>()
        )
      ).length
    );
  }

  return counts;
}

export async function GET(request: Request) {
  const { response, supabase, profile, scope } =
    await requireAdminAreaContext(request, "assignment rules");

  if (response) return response;

  if (!profile.is_active) {
    return jsonError("You do not have access to assignment rules.", 403);
  }

  const moduleId = new URL(request.url).searchParams.get("module_id");
  const result = await fetchRulesWithDetails(supabase, scope, moduleId);

  if (result.response) return result.response;

  return NextResponse.json({
    ...result.data,
    canEdit: profile.role === "admin",
    canApply: profile.role === "admin",
  });
}

export async function POST(request: Request) {
  const { response, supabase, profile, scope } =
    await requireAdminAreaContext(request, "assignment rules");

  if (response) return response;

  if (!profile.is_active || profile.role !== "admin") {
    return jsonError("Only active admins can create assignment rules.", 403);
  }

  let payload: AssignmentRulePayload;

  try {
    payload = (await request.json()) as AssignmentRulePayload;
  } catch (error) {
    console.error("[assignment-rules] Payload parsing failed", error);
    return jsonError("Unable to create assignment rule.", 400);
  }

  const { values, fieldErrors } = validateRulePayload(payload);

  if (Object.keys(fieldErrors).length > 0) {
    return jsonError("Fix the highlighted fields.", 400, fieldErrors);
  }

  const references = await validateCompanyReferences(
    supabase,
    scope.companyId,
    values,
    true
  );
  if (references.response) return references.response;

  const { data: rule, error } = await supabase
    .from("training_assignment_rules")
    .insert({
      ...buildRulePayload(values),
      company_id: scope.companyId,
      created_by: profile.id,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[assignment-rules] Insert failed", error);
    return jsonError("Unable to create assignment rule.", 500);
  }

  return NextResponse.json({ rule }, { status: 201 });
}

export async function PATCH(request: Request) {
  const { response, supabase, profile, scope } =
    await requireAdminAreaContext(request, "assignment rules");

  if (response) return response;

  if (!profile.is_active || profile.role !== "admin") {
    return jsonError("Only active admins can edit assignment rules.", 403);
  }

  let payload: AssignmentRulePayload;

  try {
    payload = (await request.json()) as AssignmentRulePayload;
  } catch (error) {
    console.error("[assignment-rules] Update payload parsing failed", error);
    return jsonError("Unable to update assignment rule.", 400);
  }

  const ruleId = readString(payload.id);

  if (!ruleId) {
    return jsonError("Choose an assignment rule to update.", 400, {
      id: "Choose an assignment rule to update.",
    });
  }

  const { data: existingRule, error: existingRuleError } = await supabase
    .from("training_assignment_rules")
    .select("id")
    .eq("id", ruleId)
    .eq("company_id", scope.companyId)
    .maybeSingle();

  if (existingRuleError) {
    console.error("[assignment-rules] Lookup failed", existingRuleError);
    return jsonError("Unable to update assignment rule.", 500);
  }

  if (!existingRule) return jsonError("Assignment rule not found.", 404);

  const { values, fieldErrors } = validateRulePayload(payload);

  if (Object.keys(fieldErrors).length > 0) {
    return jsonError("Fix the highlighted fields.", 400, fieldErrors);
  }

  const references = await validateCompanyReferences(supabase, scope.companyId, values);
  if (references.response) return references.response;

  const { data: rule, error } = await supabase
    .from("training_assignment_rules")
    .update(buildRulePayload(values))
    .eq("id", ruleId)
    .eq("company_id", scope.companyId)
    .select("*")
    .single();

  if (error) {
    console.error("[assignment-rules] Update failed", error);
    return jsonError("Unable to update assignment rule.", 500);
  }

  return NextResponse.json({ rule });
}
