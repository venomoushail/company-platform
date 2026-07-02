import { NextResponse } from "next/server";
import { getAdminContextForUserId } from "@/lib/auth/server";
import { isAdminRole } from "@/lib/auth/roles";
import { canAccessEmployee, canAccessLocation, getDataScope } from "@/lib/auth/scope";
import {
  createAdminSupabaseClient,
  getSupabaseAdminConfig,
} from "@/lib/supabase/admin";
import type { Position, Profile, ProfileRole } from "@/types/supabase";

export const dynamic = "force-dynamic";

const roles: ProfileRole[] = ["employee", "manager", "admin"];

type EmployeePayload = {
  id?: unknown;
  first_name?: unknown;
  last_name?: unknown;
  preferred_name?: unknown;
  email?: unknown;
  employee_number?: unknown;
  role?: unknown;
  location_id?: unknown;
  hire_date?: unknown;
  is_active?: unknown;
  position_ids?: unknown;
};

type EmployeeWithPositions = Profile & {
  positions: Position[];
};

function getBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) return null;

  return authHeader.slice("Bearer ".length).trim();
}

function jsonError(message: string, status: number, fieldErrors = {}) {
  return NextResponse.json({ error: message, fieldErrors }, { status });
}

function logServerError(message: string, error: unknown) {
  console.error(`[employees] ${message}`, error);
}

function isDevelopment() {
  return process.env.NODE_ENV !== "production";
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

type AuthErrorDetails = {
  name?: string;
  message?: string;
  status?: number | string;
  code?: number | string;
  cause?: unknown;
  stack?: string;
};

function getAuthErrorDetails(error: unknown): AuthErrorDetails {
  if (!error || typeof error !== "object") {
    return {
      name: undefined,
      message: typeof error === "string" ? error : undefined,
      status: undefined,
      code: undefined,
    };
  }

  const authError = error as {
    name?: unknown;
    message?: unknown;
    status?: unknown;
    code?: unknown;
  };

  return {
    name: typeof authError.name === "string" ? authError.name : undefined,
    message:
      typeof authError.message === "string" ? authError.message : undefined,
    status:
      typeof authError.status === "number" ||
      typeof authError.status === "string"
        ? authError.status
        : undefined,
    code:
      typeof authError.code === "string" || typeof authError.code === "number"
        ? authError.code
        : undefined,
    cause: "cause" in authError ? authError.cause : undefined,
    stack: typeof (authError as { stack?: unknown }).stack === "string"
      ? (authError as { stack?: string }).stack
      : undefined,
  };
}

function logAuthAdminError(message: string, error: unknown) {
  const details = getAuthErrorDetails(error);

  console.error(`[employees] ${message}`, {
    name: details.name,
    message: details.message,
    status: details.status,
    code: details.code,
    cause: details.cause,
    stack: details.stack,
  });
}

function getAuthAdminResponseMessage(error: unknown) {
  const details = getAuthErrorDetails(error);

  if (isDevelopment() && details.message) return details.message;

  if (details.message?.toLowerCase().includes("already")) {
    return "Email already exists.";
  }

  return "Unable to create employee. Please try again.";
}

function getAuthEmailUpdateResponseMessage(error: unknown) {
  const details = getAuthErrorDetails(error);

  if (details.message?.toLowerCase().includes("already")) {
    return "Email already exists.";
  }

  return "Unable to update employee email.";
}

async function requireAdminContext(request: Request) {
  const envError = validateSupabaseAdminEnv();

  if (envError) {
    return {
      response: envError,
      supabase: null,
      profile: null,
    };
  }

  const token = getBearerToken(request);

  if (!token) {
    return {
      response: jsonError("You must be signed in to access employees.", 401),
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

  if (!profile) {
    return {
      response: jsonError("You do not have access to this admin area.", 403),
      supabase: null,
      profile: null,
    };
  }

  return { response: null, supabase, profile, scope: getDataScope(profile) };
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value.filter((item): item is string => typeof item === "string");
}

function validateEmployeePayload(
  payload: EmployeePayload,
  options: { requireEmail: boolean } = { requireEmail: true }
) {
  const fieldErrors: Partial<Record<keyof EmployeePayload, string>> = {};
  const email = readString(payload.email).toLowerCase();
  const employeeNumber = readString(payload.employee_number);
  const firstName = readString(payload.first_name);
  const lastName = readString(payload.last_name);
  const preferredName = readString(payload.preferred_name);
  const role = readString(payload.role) as ProfileRole;
  const locationId = readString(payload.location_id);
  const hireDate = readString(payload.hire_date);
  const positionIds = Array.from(new Set(readStringArray(payload.position_ids)));
  const isActive =
    typeof payload.is_active === "boolean" ? payload.is_active : true;
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!firstName) fieldErrors.first_name = "First name is required.";
  if (!lastName) fieldErrors.last_name = "Last name is required.";

  if (options.requireEmail && !email) {
    fieldErrors.email = "Email is required.";
  } else if (email && !emailPattern.test(email)) {
    fieldErrors.email = "Enter a valid email address.";
  }

  if (!employeeNumber) {
    fieldErrors.employee_number = "Employee number is required.";
  }

  if (!roles.includes(role)) {
    fieldErrors.role = "Choose a valid role.";
  }

  return {
    values: {
      email,
      employeeNumber,
      firstName,
      lastName,
      preferredName: preferredName || null,
      role,
      locationId: locationId || null,
      hireDate: hireDate || null,
      positionIds,
      isActive,
    },
    fieldErrors,
  };
}

function readEmployeeId(payload: EmployeePayload) {
  return readString(payload.id);
}

export async function GET(request: Request) {
  const { response, supabase, profile, scope } = await requireAdminContext(request);

  if (response) return response;

  if (!isAdminRole(profile.role)) {
    return jsonError("You do not have access to employees.", 403);
  }

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

  const [employeesResult, locationsResult, positionsResult, companyResult] =
    await Promise.all([
    scopedEmployeesQuery,
    scopedLocationsQuery,
    supabase
      .from("positions")
      .select("*")
      .eq("company_id", scope.companyId)
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("companies")
      .select("id,name")
      .eq("id", scope.companyId)
      .single(),
  ]);

  if (employeesResult.error) {
    logServerError("Employee fetch failed", employeesResult.error);
    return jsonError(employeesResult.error.message, 500);
  }

  if (locationsResult.error) {
    logServerError("Location fetch failed", locationsResult.error);
    return jsonError(locationsResult.error.message, 500);
  }

  if (positionsResult.error) {
    logServerError("Position fetch failed", positionsResult.error);
    return jsonError(positionsResult.error.message, 500);
  }

  if (companyResult.error) {
    logServerError("Company fetch failed", companyResult.error);
    return jsonError(companyResult.error.message, 500);
  }

  const employees = employeesResult.data ?? [];
  const positions = positionsResult.data ?? [];
  const positionById = new Map(positions.map((position) => [position.id, position]));
  const employeeIds = employees.map((employee) => employee.id);
  let employeesWithPositions: EmployeeWithPositions[] = employees.map(
    (employee) => ({
      ...employee,
      positions: [],
    })
  );

  if (employeeIds.length > 0) {
    const { data: assignments, error: assignmentsError } = await supabase
      .from("employee_positions")
      .select("employee_id,position_id")
      .in("employee_id", employeeIds);

    if (assignmentsError) {
      logServerError("Employee position fetch failed", assignmentsError);
      return jsonError(assignmentsError.message, 500);
    }

    const positionsByEmployeeId = new Map<string, Position[]>();

    for (const assignment of assignments ?? []) {
      const assignedPosition = positionById.get(assignment.position_id);

      if (!assignedPosition) continue;

      const currentPositions =
        positionsByEmployeeId.get(assignment.employee_id) ?? [];
      currentPositions.push(assignedPosition);
      positionsByEmployeeId.set(assignment.employee_id, currentPositions);
    }

    employeesWithPositions = employees.map((employee) => ({
      ...employee,
      positions: positionsByEmployeeId.get(employee.id) ?? [],
    }));
  }

  return NextResponse.json({
    employees: employeesWithPositions,
    locations: locationsResult.data,
    positions,
    company: companyResult.data,
    adminProfile: profile,
  });
}

export async function POST(request: Request) {
  const { response, supabase, profile, scope } = await requireAdminContext(request);

  if (response) return response;

  if (!profile.is_active || !isAdminRole(profile.role)) {
    return jsonError("Only active admins or managers can create employees.", 403);
  }

  let payload: EmployeePayload;

  try {
    payload = (await request.json()) as EmployeePayload;
  } catch (error) {
    logServerError("Employee payload parsing failed", error);
    return jsonError("Unable to create employee. Please try again.", 400);
  }

  const { values, fieldErrors } = validateEmployeePayload(payload);

  if (Object.keys(fieldErrors).length > 0) {
    return jsonError("Fix the highlighted fields.", 400, fieldErrors);
  }

  if (scope.isManager && values.role === "admin") {
    return jsonError("Only admins can assign the admin role.", 403, {
      role: "Only admins can assign the admin role.",
    });
  }

  if (!canAccessLocation(scope, values.locationId)) {
    return jsonError("Choose a valid location.", 400, {
      location_id: scope.isManager
        ? "Managers can only create employees in their assigned location."
        : "Choose a valid location.",
    });
  }

  if (values.locationId) {
    const { data: location, error: locationError } = await supabase
      .from("locations")
      .select("id")
      .eq("id", values.locationId)
      .eq("company_id", scope.companyId)
      .maybeSingle();

    if (locationError) {
      logServerError("Location validation failed", locationError);
      return jsonError(locationError.message, 500);
    }

    if (!location) {
      return jsonError("Choose a valid location.", 400, {
        location_id: "Choose a valid location.",
      });
    }
  }

  if (values.positionIds.length > 0) {
    const { data: selectedPositions, error: selectedPositionsError } =
      await supabase
        .from("positions")
        .select("id")
        .eq("company_id", scope.companyId)
        .eq("is_active", true)
        .in("id", values.positionIds);

    if (selectedPositionsError) {
      logServerError("Position validation failed", selectedPositionsError);
      return jsonError(selectedPositionsError.message, 500);
    }

    if ((selectedPositions?.length ?? 0) !== values.positionIds.length) {
      return jsonError("Choose valid positions.", 400, {
        position_ids: "Choose valid positions.",
      });
    }
  }

  const [duplicateEmailResult, duplicateEmployeeNumberResult] =
    await Promise.all([
      supabase.from("profiles").select("id").eq("email", values.email).limit(1),
      supabase
        .from("profiles")
        .select("id")
        .eq("employee_number", values.employeeNumber)
        .limit(1),
    ]);

  if (duplicateEmailResult.error) {
    logServerError("Duplicate employee email check failed", duplicateEmailResult.error);
    return jsonError("Unable to create employee. Please try again.", 500);
  }

  if (duplicateEmployeeNumberResult.error) {
    logServerError(
      "Duplicate employee number check failed",
      duplicateEmployeeNumberResult.error
    );
    return jsonError("Unable to create employee. Please try again.", 500);
  }

  const duplicateFieldErrors: Partial<Record<keyof EmployeePayload, string>> = {};

  if ((duplicateEmailResult.data?.length ?? 0) > 0) {
    duplicateFieldErrors.email = "Email already exists.";
  }

  if ((duplicateEmployeeNumberResult.data?.length ?? 0) > 0) {
    duplicateFieldErrors.employee_number = "Employee number already exists.";
  }

  if (Object.keys(duplicateFieldErrors).length > 0) {
    return jsonError("Fix the highlighted fields.", 409, duplicateFieldErrors);
  }

  const temporaryPassword = `Temp-${crypto.randomUUID().slice(0, 8)}!A1`;
  const { data: authData, error: authError } =
    await supabase.auth.admin.createUser({
      email: values.email,
      password: temporaryPassword,
      email_confirm: true,
    });

  if (authError || !authData.user) {
    logAuthAdminError("Auth user creation failed", authError);

    return jsonError(getAuthAdminResponseMessage(authError), 500);
  }

  const { data: employee, error: insertError } = await supabase
    .from("profiles")
    .insert({
      id: authData.user.id,
      email: values.email,
      employee_number: values.employeeNumber,
      role: values.role,
      location_id: values.locationId,
      is_active: values.isActive,
      first_name: values.firstName,
      last_name: values.lastName,
      hire_date: values.hireDate,
      preferred_name: values.preferredName,
      company_id: scope.companyId,
    })
    .select("*")
    .single();

  if (insertError) {
    logServerError("Profile insert failed", insertError);
    await supabase.auth.admin.deleteUser(authData.user.id);
    return jsonError("Unable to create employee. Please try again.", 500);
  }

  if (values.positionIds.length > 0) {
    const { error: positionInsertError } = await supabase
      .from("employee_positions")
      .insert(
        values.positionIds.map((positionId) => ({
          employee_id: authData.user.id,
          position_id: positionId,
        }))
      );

    if (positionInsertError) {
      logServerError("Employee position insert failed", positionInsertError);
      await supabase.auth.admin.deleteUser(authData.user.id);
      return jsonError("Unable to assign positions. Please try again.", 500);
    }
  }

  return NextResponse.json({ employee }, { status: 201 });
}

export async function PATCH(request: Request) {
  const { response, supabase, profile, scope } = await requireAdminContext(request);

  if (response) return response;

  if (!profile.is_active || !isAdminRole(profile.role)) {
    return jsonError("Only active admins or managers can edit employees.", 403);
  }

  let payload: EmployeePayload;

  try {
    payload = (await request.json()) as EmployeePayload;
  } catch (error) {
    logServerError("Employee update payload parsing failed", error);
    return jsonError("Unable to update employee. Please try again.", 400);
  }

  const employeeId = readEmployeeId(payload);

  if (!employeeId) {
    return jsonError("Choose an employee to update.", 400, {
      id: "Choose an employee to update.",
    });
  }

  const { values, fieldErrors } = validateEmployeePayload(payload);

  if (Object.keys(fieldErrors).length > 0) {
    return jsonError("Fix the highlighted fields.", 400, fieldErrors);
  }

  const { data: existingEmployee, error: existingEmployeeError } =
    await supabase
      .from("profiles")
      .select("id,company_id,email,location_id,role")
      .eq("id", employeeId)
      .eq("company_id", scope.companyId)
      .maybeSingle();

  if (existingEmployeeError) {
    logServerError("Employee lookup failed", existingEmployeeError);
    return jsonError("Unable to update employee. Please try again.", 500);
  }

  if (!existingEmployee) {
    return jsonError("Employee not found.", 404);
  }

  if (!canAccessEmployee(scope, existingEmployee)) {
    return jsonError("Employee not found.", 404);
  }

  if (scope.isManager && existingEmployee.role === "admin") {
    return jsonError("Employee not found.", 404);
  }

  if (scope.isManager && values.role === "admin") {
    return jsonError("Only admins can assign the admin role.", 403, {
      role: "Only admins can assign the admin role.",
    });
  }

  if (!canAccessLocation(scope, values.locationId)) {
    return jsonError("Choose a valid location.", 400, {
      location_id: scope.isManager
        ? "Managers can only assign employees to their assigned location."
        : "Choose a valid location.",
    });
  }

  if (values.locationId) {
    const { data: location, error: locationError } = await supabase
      .from("locations")
      .select("id")
      .eq("id", values.locationId)
      .eq("company_id", scope.companyId)
      .maybeSingle();

    if (locationError) {
      logServerError("Location validation failed", locationError);
      return jsonError(locationError.message, 500);
    }

    if (!location) {
      return jsonError("Choose a valid location.", 400, {
        location_id: "Choose a valid location.",
      });
    }
  }

  let selectedPositions: Position[] = [];

  if (values.positionIds.length > 0) {
    const { data, error: selectedPositionsError } = await supabase
      .from("positions")
      .select("*")
      .eq("company_id", scope.companyId)
      .eq("is_active", true)
      .in("id", values.positionIds);

    if (selectedPositionsError) {
      logServerError("Position validation failed", selectedPositionsError);
      return jsonError(selectedPositionsError.message, 500);
    }

    if ((data?.length ?? 0) !== values.positionIds.length) {
      return jsonError("Choose valid positions.", 400, {
        position_ids: "Choose valid positions.",
      });
    }

    selectedPositions = data ?? [];
  }

  const { data: duplicateEmail, error: duplicateEmailError } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", values.email)
    .neq("id", employeeId)
    .limit(1);

  if (duplicateEmailError) {
    logServerError("Duplicate employee email check failed", duplicateEmailError);
    return jsonError("Unable to update employee. Please try again.", 500);
  }

  if ((duplicateEmail?.length ?? 0) > 0) {
    return jsonError("Fix the highlighted fields.", 409, {
      email: "Email already exists.",
    });
  }

  const { data: duplicateEmployeeNumber, error: duplicateEmployeeNumberError } =
    await supabase
      .from("profiles")
      .select("id")
      .eq("company_id", scope.companyId)
      .eq("employee_number", values.employeeNumber)
      .neq("id", employeeId)
      .limit(1);

  if (duplicateEmployeeNumberError) {
    logServerError(
      "Duplicate employee number check failed",
      duplicateEmployeeNumberError
    );
    return jsonError("Unable to update employee. Please try again.", 500);
  }

  if ((duplicateEmployeeNumber?.length ?? 0) > 0) {
    return jsonError("Fix the highlighted fields.", 409, {
      employee_number: "Employee number already exists.",
    });
  }

  const didEmailChange =
    values.email.toLowerCase() !== existingEmployee.email.toLowerCase();

  if (didEmailChange) {
    const { error: authEmailUpdateError } =
      await supabase.auth.admin.updateUserById(employeeId, {
        email: values.email,
        email_confirm: true,
      });

    if (authEmailUpdateError) {
      logAuthAdminError("Auth user email update failed", authEmailUpdateError);
      const message = getAuthEmailUpdateResponseMessage(authEmailUpdateError);

      return jsonError(message, message === "Email already exists." ? 409 : 500, {
        email: message,
      });
    }
  }

  const { data: employee, error: updateError } = await supabase
    .from("profiles")
    .update({
      email: values.email,
      employee_number: values.employeeNumber,
      role: values.role,
      location_id: values.locationId,
      is_active: values.isActive,
      first_name: values.firstName,
      last_name: values.lastName,
      hire_date: values.hireDate,
      preferred_name: values.preferredName,
    })
    .eq("id", employeeId)
    .eq("company_id", scope.companyId)
    .select("*")
    .single();

  if (updateError) {
    if (didEmailChange) {
      console.error(
        "[employees] Auth email updated but profile update failed; employee email may be out of sync",
        {
          employeeId,
          companyId: scope.companyId,
          previousProfileEmail: existingEmployee.email,
          updatedAuthEmail: values.email,
          error: updateError,
        }
      );

      return jsonError("Unable to update employee email.", 500, {
        email: "Unable to update employee email.",
      });
    }

    logServerError("Profile update failed", updateError);
    return jsonError("Unable to update employee. Please try again.", 500);
  }

  const { error: deletePositionsError } = await supabase
    .from("employee_positions")
    .delete()
    .eq("employee_id", employeeId);

  if (deletePositionsError) {
    logServerError("Employee position replacement failed", deletePositionsError);
    return jsonError("Unable to update positions. Please try again.", 500);
  }

  if (values.positionIds.length > 0) {
    const { error: positionInsertError } = await supabase
      .from("employee_positions")
      .insert(
        values.positionIds.map((positionId) => ({
          employee_id: employeeId,
          position_id: positionId,
        }))
      );

    if (positionInsertError) {
      logServerError("Employee position insert failed", positionInsertError);
      return jsonError("Unable to update positions. Please try again.", 500);
    }
  }

  return NextResponse.json({
    employee: {
      ...employee,
      positions: selectedPositions,
    },
  });
}
