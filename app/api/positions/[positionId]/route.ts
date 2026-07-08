import { NextResponse } from "next/server";
import { requireAdminAreaContext, jsonError } from "@/lib/auth/api";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type {
  Location,
  Position,
  Profile,
  TrainingAssignment,
  TrainingModule,
  TrainingModulePosition,
} from "@/types/supabase";

export const dynamic = "force-dynamic";

type SupabaseAdminClient = ReturnType<typeof createAdminSupabaseClient>;

type PositionEmployeeRow = Pick<
  Profile,
  | "id"
  | "full_name"
  | "preferred_name"
  | "email"
  | "employee_number"
  | "role"
  | "is_active"
> & {
  location: Location | null;
  latest_training_status: TrainingAssignment["status"] | null;
  latest_training_title: string | null;
};

type PositionTrainingRow = {
  module_id: string;
  title: string;
  status: string;
  assigned_count: number;
  completed_count: number;
  failed_count: number;
  average_score: number | null;
  past_due_count: number;
};

function logServerError(message: string, error: unknown) {
  console.error(`[position-detail] ${message}`, error);
}

function isAssignmentPastDue(
  assignment: TrainingAssignment,
  trainingModule: TrainingModule | undefined,
  todayStart: Date
) {
  if (assignment.status === "completed" || !trainingModule?.days_allowed) {
    return false;
  }

  const dueDate = new Date(assignment.assigned_at);
  dueDate.setDate(dueDate.getDate() + trainingModule.days_allowed);

  return dueDate < todayStart;
}

function averageScore(assignments: TrainingAssignment[]) {
  const scoredAssignments = assignments.filter(
    (assignment) => assignment.latest_score !== null
  );

  if (scoredAssignments.length === 0) return null;

  return Math.round(
    scoredAssignments.reduce(
      (total, assignment) => total + (assignment.latest_score ?? 0),
      0
    ) / scoredAssignments.length
  );
}

function getLatestAssignment(assignments: TrainingAssignment[]) {
  return [...assignments].sort((left, right) => {
    const leftTime = new Date(
      left.completed_at ?? left.started_at ?? left.assigned_at
    ).getTime();
    const rightTime = new Date(
      right.completed_at ?? right.started_at ?? right.assigned_at
    ).getTime();

    return rightTime - leftTime;
  })[0];
}

async function fetchScopedEmployeesForPosition(
  supabase: SupabaseAdminClient,
  companyId: string,
  positionId: string,
  locationIds: string[] | null
) {
  const { data: employeePositions, error: employeePositionsError } =
    await supabase
      .from("employee_positions")
      .select("employee_id,position_id")
      .eq("position_id", positionId);

  if (employeePositionsError) {
    logServerError("Employee position fetch failed", employeePositionsError);
    return {
      response: jsonError("Unable to load position employees.", 500),
      employees: null,
    };
  }

  const employeeIds = (employeePositions ?? []).map(
    (assignment) => assignment.employee_id
  );

  if (employeeIds.length === 0) {
    return { response: null, employees: [] as Profile[] };
  }

  const employeesQuery = supabase
    .from("profiles")
    .select("*")
    .eq("company_id", companyId)
    .in("id", employeeIds)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });
  const scopedEmployeesQuery =
    locationIds === null
      ? employeesQuery
      : locationIds.length > 0
        ? employeesQuery.in("location_id", locationIds)
        : employeesQuery.limit(0);
  const { data: employees, error: employeesError } = await scopedEmployeesQuery;

  if (employeesError) {
    logServerError("Position employees fetch failed", employeesError);
    return {
      response: jsonError("Unable to load position employees.", 500),
      employees: null,
    };
  }

  return { response: null, employees: employees ?? [] };
}

async function fetchPositionAssignments(
  supabase: SupabaseAdminClient,
  employeeIds: string[],
  moduleIds: string[]
) {
  if (employeeIds.length === 0 || moduleIds.length === 0) {
    return { assignments: [] as TrainingAssignment[], response: null };
  }

  const { data, error } = await supabase
    .from("training_assignments")
    .select("*")
    .in("employee_id", employeeIds)
    .in("module_id", moduleIds)
    .order("assigned_at", { ascending: false });

  if (error) {
    logServerError("Training assignments fetch failed", error);
    return {
      assignments: [],
      response: jsonError("Unable to load position training assignments.", 500),
    };
  }

  return { assignments: data ?? [], response: null };
}

function buildEmployeeRows(
  employees: Profile[],
  assignments: TrainingAssignment[],
  moduleById: Map<string, TrainingModule>,
  locationById: Map<string, Location>
) {
  const assignmentsByEmployeeId = new Map<string, TrainingAssignment[]>();

  for (const assignment of assignments) {
    const currentAssignments =
      assignmentsByEmployeeId.get(assignment.employee_id) ?? [];
    currentAssignments.push(assignment);
    assignmentsByEmployeeId.set(assignment.employee_id, currentAssignments);
  }

  return employees.map<PositionEmployeeRow>((employee) => {
    const latestAssignment = getLatestAssignment(
      assignmentsByEmployeeId.get(employee.id) ?? []
    );
    const latestModule = latestAssignment
      ? moduleById.get(latestAssignment.module_id)
      : undefined;

    return {
      id: employee.id,
      full_name: employee.full_name,
      preferred_name: employee.preferred_name,
      email: employee.email,
      employee_number: employee.employee_number,
      role: employee.role,
      is_active: employee.is_active,
      location: employee.location_id
        ? locationById.get(employee.location_id) ?? null
        : null,
      latest_training_status: latestAssignment?.status ?? null,
      latest_training_title: latestModule?.title ?? null,
    };
  });
}

function buildTrainingRows(
  targetedModuleIds: string[],
  assignments: TrainingAssignment[],
  moduleById: Map<string, TrainingModule>,
  todayStart: Date
) {
  const assignmentsByModuleId = new Map<string, TrainingAssignment[]>();

  for (const assignment of assignments) {
    const currentAssignments =
      assignmentsByModuleId.get(assignment.module_id) ?? [];
    currentAssignments.push(assignment);
    assignmentsByModuleId.set(assignment.module_id, currentAssignments);
  }

  return targetedModuleIds
    .flatMap<PositionTrainingRow>((moduleId) => {
      const trainingModule = moduleById.get(moduleId);
      if (!trainingModule) return [];

      const moduleAssignments = assignmentsByModuleId.get(moduleId) ?? [];

      return [
        {
          module_id: moduleId,
          title: trainingModule.title,
          status: trainingModule.status,
          assigned_count: moduleAssignments.length,
          completed_count: moduleAssignments.filter(
            (assignment) => assignment.status === "completed"
          ).length,
          failed_count: moduleAssignments.filter(
            (assignment) => assignment.status === "failed"
          ).length,
          average_score: averageScore(moduleAssignments),
          past_due_count: moduleAssignments.filter((assignment) =>
            isAssignmentPastDue(assignment, trainingModule, todayStart)
          ).length,
        },
      ];
    })
    .sort((left, right) => left.title.localeCompare(right.title));
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ positionId: string }> }
) {
  const { positionId } = await params;
  const { response, supabase, scope } = await requireAdminAreaContext(
    request,
    "position details"
  );

  if (response) return response;

  if (!positionId) {
    return jsonError("Choose a position to view.", 400);
  }

  const positionResult = await supabase
    .from("positions")
    .select("*")
    .eq("id", positionId)
    .eq("company_id", scope.companyId)
    .maybeSingle();

  if (positionResult.error) {
    logServerError("Position fetch failed", positionResult.error);
    return jsonError("Unable to load position.", 500);
  }

  if (!positionResult.data) {
    return jsonError("Position not found.", 404);
  }

  const locationIds = scope.canAccessAllLocations ? null : scope.locationIds;
  const scopedEmployeesResult = await fetchScopedEmployeesForPosition(
    supabase,
    scope.companyId,
    positionId,
    locationIds
  );

  if (scopedEmployeesResult.response) return scopedEmployeesResult.response;

  const employees = scopedEmployeesResult.employees ?? [];
  const employeeIds = employees.map((employee) => employee.id);

  const [modulePositionsResult, modulesResult, locationsResult] =
    await Promise.all([
      supabase
        .from("training_module_positions")
        .select("module_id,position_id,company_id,created_at")
        .eq("company_id", scope.companyId)
        .eq("position_id", positionId),
      supabase
        .from("training_modules")
        .select("*")
        .eq("company_id", scope.companyId),
      supabase
        .from("locations")
        .select("*")
        .eq("company_id", scope.companyId),
    ]);

  if (modulePositionsResult.error) {
    logServerError(
      "Training module position fetch failed",
      modulePositionsResult.error
    );
    return jsonError("Unable to load targeted trainings.", 500);
  }

  if (modulesResult.error) {
    logServerError("Training modules fetch failed", modulesResult.error);
    return jsonError("Unable to load position trainings.", 500);
  }

  if (locationsResult.error) {
    logServerError("Locations fetch failed", locationsResult.error);
    return jsonError("Unable to load employee locations.", 500);
  }

  const targetedModuleIds = Array.from(
    new Set(
      ((modulePositionsResult.data ?? []) as Pick<
        TrainingModulePosition,
        "module_id"
      >[]).map((assignment) => assignment.module_id)
    )
  );
  const modules = modulesResult.data ?? [];
  const moduleById = new Map(
    modules.map((trainingModule) => [trainingModule.id, trainingModule])
  );
  const assignmentResult = await fetchPositionAssignments(
    supabase,
    employeeIds,
    targetedModuleIds
  );

  if (assignmentResult.response) return assignmentResult.response;

  const assignments = assignmentResult.assignments;
  const completedAssignments = assignments.filter(
    (assignment) => assignment.status === "completed"
  );
  const failedAssignments = assignments.filter(
    (assignment) => assignment.status === "failed"
  );
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const pastDueCount = assignments.filter((assignment) =>
    isAssignmentPastDue(assignment, moduleById.get(assignment.module_id), todayStart)
  ).length;
  const locationById = new Map(
    (locationsResult.data ?? []).map((location) => [location.id, location])
  );

  return NextResponse.json({
    position: positionResult.data satisfies Position,
    metrics: {
      total_employees: employees.length,
      active_employees: employees.filter((employee) => employee.is_active).length,
      assigned_trainings: assignments.length,
      completed_trainings: completedAssignments.length,
      completion_rate:
        assignments.length === 0
          ? 0
          : Math.round((completedAssignments.length / assignments.length) * 100),
      average_latest_score: averageScore(assignments),
      failed_count: failedAssignments.length,
      past_due_count: pastDueCount,
    },
    employees: buildEmployeeRows(employees, assignments, moduleById, locationById),
    trainings: buildTrainingRows(
      targetedModuleIds,
      assignments,
      moduleById,
      todayStart
    ),
  });
}
