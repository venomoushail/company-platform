import { NextResponse } from "next/server";
import { getAdminContextForUserId } from "@/lib/auth/server";
import { isAdminRole } from "@/lib/auth/roles";
import { canAccessEmployee, getDataScopeForProfile } from "@/lib/auth/scope";
import {
  createAdminSupabaseClient,
  getSupabaseAdminConfig,
} from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type PasswordSetupStep =
  | "parse_request"
  | "verify_permissions"
  | "validate_employee"
  | "send_password_recovery";

const genericPasswordSetupError = "Unable to send password setup email.";

function getErrorDetail(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.trim()
  ) {
    return error.message.trim();
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return "";
}

function getSafeErrorMessage(step: PasswordSetupStep, error?: unknown) {
  const detail = getErrorDetail(error);

  if (process.env.NODE_ENV === "development" && detail) {
    return `${step} failed: ${detail}`;
  }

  return `${genericPasswordSetupError} Failed step: ${step}.`;
}

function jsonError(step: PasswordSetupStep, status: number, error?: unknown) {
  return NextResponse.json(
    { error: getSafeErrorMessage(step, error), step },
    { status }
  );
}

function getBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) return null;

  return authHeader.slice("Bearer ".length).trim();
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getPasswordResetRedirectUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (!configuredUrl) {
    throw new Error("NEXT_PUBLIC_APP_URL is not configured.");
  }

  return new URL("/reset-password", configuredUrl.replace(/\/$/, "/")).toString();
}

async function requireAdminContext(request: Request) {
  const { url, serviceRoleKey } = getSupabaseAdminConfig();

  if (!url || !serviceRoleKey) {
    return {
      response: jsonError(
        "verify_permissions",
        500,
        new Error("Supabase admin environment is not configured.")
      ),
      supabase: null,
      profile: null,
    };
  }

  const token = getBearerToken(request);

  if (!token) {
    return {
      response: jsonError(
        "verify_permissions",
        401,
        new Error("Missing bearer token.")
      ),
      supabase: null,
      profile: null,
    };
  }

  const supabase = createAdminSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);

  if (userError || !userData.user) {
    if (userError) {
      console.error(
        "[employees] Password setup permission verification failed",
        userError
      );
    }

    return {
      response: jsonError(
        "verify_permissions",
        401,
        userError || new Error("No authenticated user returned.")
      ),
      supabase: null,
      profile: null,
    };
  }

  const { profile, error: profileError } = await getAdminContextForUserId(
    userData.user.id
  );

  if (!profile || !profile.is_active || !isAdminRole(profile.role)) {
    if (profileError) {
      console.error(
        "[employees] Password setup admin profile lookup failed",
        profileError
      );
    }

    return {
      response: jsonError(
        "verify_permissions",
        403,
        profileError || new Error("User is not an active admin or manager.")
      ),
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

export async function POST(request: Request) {
  const { response, supabase, scope } = await requireAdminContext(request);

  if (response) return response;

  let payload: { employee_id?: unknown };

  try {
    payload = (await request.json()) as { employee_id?: unknown };
  } catch (error) {
    console.error("[employees] Password setup payload parsing failed", error);
    return jsonError("parse_request", 400, error);
  }

  const employeeId = readString(payload.employee_id);

  if (!employeeId) {
    return jsonError("validate_employee", 400, new Error("Choose an employee."));
  }

  const { data: employee, error: employeeError } = await supabase
    .from("profiles")
    .select("id,email,company_id,location_id")
    .eq("id", employeeId)
    .eq("company_id", scope.companyId)
    .maybeSingle();

  if (employeeError) {
    console.error("[employees] Password setup employee lookup failed", employeeError);
    return jsonError("validate_employee", 500, employeeError);
  }

  if (!employee) {
    return jsonError("validate_employee", 404, new Error("Employee not found."));
  }

  if (!canAccessEmployee(scope, employee)) {
    return jsonError("validate_employee", 404, new Error("Employee not found."));
  }

  let redirectTo: string;

  try {
    redirectTo = getPasswordResetRedirectUrl();
  } catch (error) {
    console.error("[employees] Password setup redirect URL failed", error);
    return jsonError("send_password_recovery", 500, error);
  }

  const { error: resetError } = await supabase.auth.resetPasswordForEmail(
    employee.email,
    { redirectTo }
  );

  if (resetError) {
    console.error("[employees] Password setup email failed", resetError);
    return jsonError("send_password_recovery", 500, resetError);
  }

  return NextResponse.json({ success: true });
}
