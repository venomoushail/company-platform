import { NextResponse } from "next/server";
import { getAdminContextForUserId } from "@/lib/auth/server";
import { isAdminRole } from "@/lib/auth/roles";
import { getDataScopeForProfile } from "@/lib/auth/scope";
import {
  createAdminSupabaseClient,
  getSupabaseAdminConfig,
} from "@/lib/supabase/admin";
import type {
  Location,
  Profile,
  TrainingAssignment,
  TrainingModule,
} from "@/types/supabase";

export const dynamic = "force-dynamic";

type TrainingResultRow = {
  assignment: TrainingAssignment;
  employee: Profile;
  module: TrainingModule;
  location: Location | null;
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
  console.error(`[training-results] ${message}`, error);
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
      response: jsonError("You must be signed in to view training results.", 401),
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
      response: jsonError("You do not have access to training results.", 403),
      supabase: null,
      profile: null,
    };
  }

  return {
    response: null,
    supabase,
    profile,
    scope: await getDataScopeForProfile(supabase, profile),
  };
}

export async function GET(request: Request) {
  const { response, supabase, scope } = await requireAdminContext(request);

  if (response) return response;

  const employeesQuery = supabase
    .from("profiles")
    .select("*")
    .eq("company_id", scope.companyId)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });
  const scopedEmployeesQuery = scope.canAccessAllLocations
    ? employeesQuery
    : scope.locationIds.length > 0
      ? employeesQuery.in("location_id", scope.locationIds)
      : employeesQuery.limit(0);
  const locationsQuery = supabase
    .from("locations")
    .select("*")
    .eq("company_id", scope.companyId)
    .order("store_number", { ascending: true });
  const scopedLocationsQuery = scope.canAccessAllLocations
    ? locationsQuery
    : scope.locationIds.length > 0
      ? locationsQuery.in("id", scope.locationIds)
      : locationsQuery.limit(0);

  const [employeesResult, modulesResult, locationsResult] = await Promise.all([
    scopedEmployeesQuery,
    supabase
      .from("training_modules")
      .select("*")
      .eq("company_id", scope.companyId)
      .order("title", { ascending: true }),
    scopedLocationsQuery,
  ]);

  if (employeesResult.error) {
    logServerError("Employees lookup failed", employeesResult.error);
    return jsonError("Unable to load employees.", 500);
  }

  if (modulesResult.error) {
    logServerError("Training modules lookup failed", modulesResult.error);
    return jsonError("Unable to load training modules.", 500);
  }

  if (locationsResult.error) {
    logServerError("Locations lookup failed", locationsResult.error);
    return jsonError("Unable to load locations.", 500);
  }

  const employees = employeesResult.data ?? [];
  const modules = modulesResult.data ?? [];
  const employeeIds = employees.map((employee) => employee.id);
  const moduleIds = modules.map((module) => module.id);

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
      return jsonError("Unable to load training assignments.", 500);
    }

    assignments = data ?? [];
  }

  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  const moduleById = new Map(modules.map((module) => [module.id, module]));
  const locationById = new Map(
    (locationsResult.data ?? []).map((location) => [location.id, location])
  );
  const results: TrainingResultRow[] = assignments.flatMap((assignment) => {
    const employee = employeeById.get(assignment.employee_id);
    const trainingModule = moduleById.get(assignment.module_id);

    if (!employee || !trainingModule) return [];

    return [
      {
        assignment,
        employee,
        module: trainingModule,
        location: employee.location_id
          ? locationById.get(employee.location_id) ?? null
          : null,
      },
    ];
  });

  return NextResponse.json({
    results,
    modules,
    locations: locationsResult.data ?? [],
  });
}
