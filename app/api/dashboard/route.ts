import { NextResponse } from "next/server";
import { getAdminContextForUserId } from "@/lib/auth/server";
import { isAdminRole } from "@/lib/auth/roles";
import { getDataScope } from "@/lib/auth/scope";
import {
  createAdminSupabaseClient,
  getSupabaseAdminConfig,
} from "@/lib/supabase/admin";
import type { Profile, TrainingAssignment, TrainingModule } from "@/types/supabase";

export const dynamic = "force-dynamic";

type DashboardActivity = {
  assignment: TrainingAssignment;
  employeeName: string;
  moduleTitle: string;
};

function getBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) return null;

  return authHeader.slice("Bearer ".length).trim();
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function logServerError(message: string, error: unknown) {
  console.error(`[dashboard] ${message}`, error);
}

function validateSupabaseAdminEnv() {
  const { url, serviceRoleKey } = getSupabaseAdminConfig();

  if (!url) {
    return jsonError(
      "Missing NEXT_PUBLIC_SUPABASE_URL. Add it to your server environment.",
      500
    );
  }

  try {
    new URL(url);
  } catch {
    return jsonError(
      "Invalid NEXT_PUBLIC_SUPABASE_URL. Check the Supabase project URL.",
      500
    );
  }

  if (!serviceRoleKey) {
    return jsonError(
      "Missing SUPABASE_SERVICE_ROLE_KEY. Add it to your server environment.",
      500
    );
  }

  return null;
}

async function requireAdminContext(request: Request) {
  const envError = validateSupabaseAdminEnv();

  if (envError) {
    return { response: envError, supabase: null, profile: null };
  }

  const token = getBearerToken(request);

  if (!token) {
    return {
      response: jsonError("You must be signed in to view the dashboard.", 401),
      supabase: null,
      profile: null,
    };
  }

  const supabase = createAdminSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);

  if (userError || !userData.user) {
    return {
      response: jsonError("Your session is invalid or expired.", 401),
      supabase: null,
      profile: null,
    };
  }

  const { profile } = await getAdminContextForUserId(userData.user.id);

  if (!profile || !profile.is_active || !isAdminRole(profile.role)) {
    return {
      response: jsonError("Only active admins or managers can view the dashboard.", 403),
      supabase: null,
      profile: null,
    };
  }

  return { response: null, supabase, profile, scope: getDataScope(profile) };
}

function getJoinedActivity(
  assignments: TrainingAssignment[],
  employeeById: Map<string, Profile>,
  moduleById: Map<string, TrainingModule>
) {
  return assignments.flatMap<DashboardActivity>((assignment) => {
    const employee = employeeById.get(assignment.employee_id);
    const trainingModule = moduleById.get(assignment.module_id);

    if (!employee || !trainingModule) return [];

    return [
      {
        assignment,
        employeeName: employee.full_name,
        moduleTitle: trainingModule.title,
      },
    ];
  });
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

export async function GET(request: Request) {
  const { response, supabase, scope } = await requireAdminContext(request);

  if (response) return response;

  const employeesQuery = supabase
    .from("profiles")
    .select("*")
    .eq("company_id", scope.companyId)
    .eq("is_active", true);
  const scopedEmployeesQuery = scope.canAccessAllLocations
    ? employeesQuery
    : scope.locationIds.length > 0
      ? employeesQuery.in("location_id", scope.locationIds)
      : employeesQuery.limit(0);

  const [employeesResult, modulesResult] = await Promise.all([
    scopedEmployeesQuery,
    supabase
      .from("training_modules")
      .select("*")
      .eq("company_id", scope.companyId)
      .neq("status", "archived"),
  ]);

  if (employeesResult.error) {
    logServerError("Employees lookup failed", employeesResult.error);
    return jsonError("Unable to load dashboard employee metrics.", 500);
  }

  if (modulesResult.error) {
    logServerError("Training modules lookup failed", modulesResult.error);
    return jsonError("Unable to load dashboard training metrics.", 500);
  }

  const employees = employeesResult.data ?? [];
  const modules = modulesResult.data ?? [];
  const employeeIds = employees.map((employee) => employee.id);
  const moduleIds = modules.map((trainingModule) => trainingModule.id);

  let assignments: TrainingAssignment[] = [];

  if (employeeIds.length > 0 && moduleIds.length > 0) {
    const { data, error } = await supabase
      .from("training_assignments")
      .select("*")
      .in("employee_id", employeeIds)
      .in("module_id", moduleIds)
      .order("assigned_at", { ascending: false });

    if (error) {
      logServerError("Training assignments lookup failed", error);
      return jsonError("Unable to load dashboard assignment metrics.", 500);
    }

    assignments = data ?? [];
  }

  const completedAssignments = assignments.filter(
    (assignment) => assignment.status === "completed" && assignment.passed === true
  );
  const scoredAssignments = assignments.filter(
    (assignment) => assignment.latest_score !== null
  );
  const completionRate =
    assignments.length === 0
      ? 0
      : Math.round((completedAssignments.length / assignments.length) * 100);

  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  const moduleById = new Map(
    modules.map((trainingModule) => [trainingModule.id, trainingModule])
  );
  const averageScore =
    scoredAssignments.length === 0
      ? null
      : Math.round(
          scoredAssignments.reduce(
            (total, assignment) => total + (assignment.latest_score ?? 0),
            0
          ) / scoredAssignments.length
        );
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const pastDue = assignments.filter((assignment) =>
    isAssignmentPastDue(assignment, moduleById.get(assignment.module_id), todayStart)
  ).length;

  const recentCompletions = getJoinedActivity(
    [...completedAssignments]
      .sort((left, right) => {
        const leftTime = new Date(left.completed_at ?? left.assigned_at).getTime();
        const rightTime = new Date(right.completed_at ?? right.assigned_at).getTime();

        return rightTime - leftTime;
      })
      .slice(0, 5),
    employeeById,
    moduleById
  );
  const needsAttention = getJoinedActivity(
    assignments
      .filter((assignment) => assignment.status === "failed")
      .sort((left, right) => {
        const leftTime = new Date(left.completed_at ?? left.assigned_at).getTime();
        const rightTime = new Date(right.completed_at ?? right.assigned_at).getTime();

        return rightTime - leftTime;
      })
      .slice(0, 5),
    employeeById,
    moduleById
  );

  return NextResponse.json({
    metrics: {
      employees: employees.length,
      trainingModules: modules.length,
      completionRate,
      averageScore,
      pastDue,
      totalAssignments: assignments.length,
      completedAssignments: completedAssignments.length,
    },
    recentCompletions,
    needsAttention,
    dueDateSupport: true,
  });
}
