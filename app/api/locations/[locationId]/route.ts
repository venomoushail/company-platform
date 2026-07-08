import { NextResponse } from "next/server";
import { requireAdminAreaContext, jsonError } from "@/lib/auth/api";
import { canAccessLocation } from "@/lib/auth/scope";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type {
  EmployeePosition,
  Location,
  Position,
  Profile,
  TrainingAssignment,
  TrainingModule,
} from "@/types/supabase";

export const dynamic = "force-dynamic";

type SupabaseAdminClient = ReturnType<typeof createAdminSupabaseClient>;

type EmployeeDetailRow = Pick<
  Profile,
  "id" | "full_name" | "preferred_name" | "email" | "role" | "is_active"
> & {
  positions: Position[];
  latest_training_status: TrainingAssignment["status"] | null;
  latest_training_title: string | null;
};

type LocationManagerRow = Pick<
  Profile,
  "id" | "full_name" | "preferred_name" | "email" | "role" | "is_active"
> & {
  source: "managed" | "home_location_fallback";
};

type TrainingActivityRow = {
  module_id: string;
  title: string;
  assigned_count: number;
  completed_count: number;
  failed_count: number;
  average_score: number | null;
  past_due_count: number;
};

function logServerError(message: string, error: unknown) {
  console.error(`[location-detail] ${message}`, error);
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

function getPositionsByEmployee(
  employeePositions: Pick<EmployeePosition, "employee_id" | "position_id">[],
  positionById: Map<string, Position>
) {
  const positionsByEmployeeId = new Map<string, Position[]>();

  for (const assignment of employeePositions) {
    const position = positionById.get(assignment.position_id);
    if (!position) continue;

    const currentPositions =
      positionsByEmployeeId.get(assignment.employee_id) ?? [];
    currentPositions.push(position);
    positionsByEmployeeId.set(assignment.employee_id, currentPositions);
  }

  return positionsByEmployeeId;
}

async function fetchLocationAssignments(
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
      response: jsonError("Unable to load location training assignments.", 500),
    };
  }

  return { assignments: data ?? [], response: null };
}

function buildEmployeeRows(
  employees: Profile[],
  assignments: TrainingAssignment[],
  moduleById: Map<string, TrainingModule>,
  positionsByEmployeeId: Map<string, Position[]>
) {
  const assignmentsByEmployeeId = new Map<string, TrainingAssignment[]>();

  for (const assignment of assignments) {
    const currentAssignments =
      assignmentsByEmployeeId.get(assignment.employee_id) ?? [];
    currentAssignments.push(assignment);
    assignmentsByEmployeeId.set(assignment.employee_id, currentAssignments);
  }

  return employees.map<EmployeeDetailRow>((employee) => {
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
      role: employee.role,
      is_active: employee.is_active,
      positions: [...(positionsByEmployeeId.get(employee.id) ?? [])].sort(
        (left, right) => left.name.localeCompare(right.name)
      ),
      latest_training_status: latestAssignment?.status ?? null,
      latest_training_title: latestModule?.title ?? null,
    };
  });
}

async function fetchLocationManagers(
  supabase: SupabaseAdminClient,
  companyId: string,
  locationId: string,
  locationEmployees: Profile[]
) {
  const [locationManagersResult, companyManagerLocationsResult] =
    await Promise.all([
      supabase
        .from("manager_locations")
        .select("manager_id")
        .eq("company_id", companyId)
        .eq("location_id", locationId),
      supabase
        .from("manager_locations")
        .select("manager_id")
        .eq("company_id", companyId),
    ]);

  if (locationManagersResult.error) {
    logServerError("Location managers fetch failed", locationManagersResult.error);
    return {
      response: jsonError("Unable to load assigned managers.", 500),
      managers: [] as LocationManagerRow[],
    };
  }

  if (companyManagerLocationsResult.error) {
    logServerError(
      "Company manager location fallback fetch failed",
      companyManagerLocationsResult.error
    );
    return {
      response: jsonError("Unable to load assigned managers.", 500),
      managers: [] as LocationManagerRow[],
    };
  }

  const managedManagerIds = Array.from(
    new Set((locationManagersResult.data ?? []).map((row) => row.manager_id))
  );
  const managersWithAnyManagedLocation = new Set(
    (companyManagerLocationsResult.data ?? []).map((row) => row.manager_id)
  );
  const fallbackManagers = locationEmployees.filter(
    (employee) =>
      employee.role === "manager" && !managersWithAnyManagedLocation.has(employee.id)
  );
  const fallbackManagerIds = fallbackManagers.map((employee) => employee.id);
  const managerIds = Array.from(
    new Set([...managedManagerIds, ...fallbackManagerIds])
  );

  if (managerIds.length === 0) {
    return { response: null, managers: [] as LocationManagerRow[] };
  }

  const { data: managers, error: managersError } = await supabase
    .from("profiles")
    .select("id,full_name,preferred_name,email,role,is_active")
    .eq("company_id", companyId)
    .in("id", managerIds)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  if (managersError) {
    logServerError("Assigned manager profiles fetch failed", managersError);
    return {
      response: jsonError("Unable to load assigned managers.", 500),
      managers: [] as LocationManagerRow[],
    };
  }

  const managedManagerIdSet = new Set(managedManagerIds);

  return {
    response: null,
    managers: (managers ?? []).map<LocationManagerRow>((manager) => ({
      ...manager,
      source: managedManagerIdSet.has(manager.id)
        ? "managed"
        : "home_location_fallback",
    })),
  };
}

function buildTrainingRows(
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

  return [...assignmentsByModuleId.entries()]
    .flatMap<TrainingActivityRow>(([moduleId, moduleAssignments]) => {
      const trainingModule = moduleById.get(moduleId);
      if (!trainingModule) return [];

      return [
        {
          module_id: moduleId,
          title: trainingModule.title,
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
  { params }: { params: Promise<{ locationId: string }> }
) {
  const { locationId } = await params;
  const { response, supabase, scope } = await requireAdminAreaContext(
    request,
    "location details"
  );

  if (response) return response;

  if (!locationId) {
    return jsonError("Choose a location to view.", 400);
  }

  if (!scope.canAccessAllLocations && !canAccessLocation(scope, locationId)) {
    return jsonError("Location not found.", 404);
  }

  const [locationResult, employeesResult, modulesResult, positionsResult] =
    await Promise.all([
      supabase
        .from("locations")
        .select("*")
        .eq("id", locationId)
        .eq("company_id", scope.companyId)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("*")
        .eq("company_id", scope.companyId)
        .eq("location_id", locationId)
        .order("last_name", { ascending: true })
        .order("first_name", { ascending: true }),
      supabase
        .from("training_modules")
        .select("*")
        .eq("company_id", scope.companyId),
      supabase
        .from("positions")
        .select("*")
        .eq("company_id", scope.companyId),
    ]);

  if (locationResult.error) {
    logServerError("Location fetch failed", locationResult.error);
    return jsonError("Unable to load location.", 500);
  }

  if (!locationResult.data) {
    return jsonError("Location not found.", 404);
  }

  if (employeesResult.error) {
    logServerError("Employees fetch failed", employeesResult.error);
    return jsonError("Unable to load location employees.", 500);
  }

  if (modulesResult.error) {
    logServerError("Training modules fetch failed", modulesResult.error);
    return jsonError("Unable to load location trainings.", 500);
  }

  if (positionsResult.error) {
    logServerError("Positions fetch failed", positionsResult.error);
    return jsonError("Unable to load employee positions.", 500);
  }

  const location = locationResult.data satisfies Location;
  const employees = employeesResult.data ?? [];
  const modules = modulesResult.data ?? [];
  const positions = positionsResult.data ?? [];
  const employeeIds = employees.map((employee) => employee.id);
  const moduleIds = modules.map((trainingModule) => trainingModule.id);
  const locationManagersResult = await fetchLocationManagers(
    supabase,
    scope.companyId,
    locationId,
    employees
  );

  if (locationManagersResult.response) return locationManagersResult.response;

  const assignmentResult = await fetchLocationAssignments(
    supabase,
    employeeIds,
    moduleIds
  );

  if (assignmentResult.response) return assignmentResult.response;

  let employeePositions: Pick<
    EmployeePosition,
    "employee_id" | "position_id"
  >[] = [];

  if (employeeIds.length > 0) {
    const { data, error } = await supabase
      .from("employee_positions")
      .select("employee_id,position_id")
      .in("employee_id", employeeIds);

    if (error) {
      logServerError("Employee positions fetch failed", error);
      return jsonError("Unable to load employee positions.", 500);
    }

    employeePositions = data ?? [];
  }

  const assignments = assignmentResult.assignments;
  const completedAssignments = assignments.filter(
    (assignment) => assignment.status === "completed"
  );
  const moduleById = new Map(
    modules.map((trainingModule) => [trainingModule.id, trainingModule])
  );
  const positionById = new Map(positions.map((position) => [position.id, position]));
  const positionsByEmployeeId = getPositionsByEmployee(
    employeePositions,
    positionById
  );
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const pastDueCount = assignments.filter((assignment) =>
    isAssignmentPastDue(assignment, moduleById.get(assignment.module_id), todayStart)
  ).length;

  return NextResponse.json({
    location,
    metrics: {
      total_employees: employees.length,
      active_employees: employees.filter((employee) => employee.is_active).length,
      managers: employees.filter((employee) => employee.role === "manager").length,
      assigned_trainings: assignments.length,
      completed_trainings: completedAssignments.length,
      completion_rate:
        assignments.length === 0
          ? 0
          : Math.round((completedAssignments.length / assignments.length) * 100),
      average_latest_score: averageScore(assignments),
      past_due_count: pastDueCount,
    },
    employees: buildEmployeeRows(
      employees,
      assignments,
      moduleById,
      positionsByEmployeeId
    ),
    managers: locationManagersResult.managers,
    trainings: buildTrainingRows(assignments, moduleById, todayStart),
  });
}
