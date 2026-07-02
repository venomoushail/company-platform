import { NextResponse } from "next/server";
import { getAdminContextForUserId } from "@/lib/auth/server";
import {
  createAdminSupabaseClient,
  getSupabaseAdminConfig,
} from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function getBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) return null;

  return authHeader.slice("Bearer ".length).trim();
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getAuthErrorMessage(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.trim()
  ) {
    return error.message;
  }

  return "Unable to set test password.";
}

async function requireActiveAdmin(request: Request) {
  const { url, serviceRoleKey } = getSupabaseAdminConfig();

  if (!url || !serviceRoleKey) {
    return {
      response: jsonError("Supabase admin environment is not configured.", 500),
      supabase: null,
      profile: null,
    };
  }

  const token = getBearerToken(request);

  if (!token) {
    return {
      response: jsonError("You must be signed in to manage employees.", 401),
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

  if (!profile || !profile.is_active || profile.role !== "admin") {
    return {
      response: jsonError("Only active admins can set test passwords.", 403),
      supabase: null,
      profile: null,
    };
  }

  return { response: null, supabase, profile };
}

export async function POST(request: Request) {
  const { response, supabase, profile } = await requireActiveAdmin(request);

  if (response) return response;

  let payload: { employee_id?: unknown; password?: unknown };

  try {
    payload = (await request.json()) as {
      employee_id?: unknown;
      password?: unknown;
    };
  } catch (error) {
    console.error("[employees] Test password payload parsing failed", error);
    return jsonError("Unable to set test password.", 400);
  }

  const employeeId = readString(payload.employee_id);
  const newPassword = readString(payload.password);

  if (!employeeId) {
    return jsonError("Choose an employee.", 400);
  }

  if (newPassword.length < 8) {
    return jsonError("Enter a temporary password with at least 8 characters.", 400);
  }

  const { data: employee, error: employeeError } = await supabase
    .from("profiles")
    .select("id,company_id")
    .eq("id", employeeId)
    .eq("company_id", profile.company_id)
    .maybeSingle();

  if (employeeError) {
    console.error("[employees] Test password employee lookup failed", employeeError);
    return jsonError("Unable to set test password.", 500);
  }

  if (!employee) {
    return jsonError("Employee not found.", 404);
  }

  // TODO: Remove this testing-only password override, or restrict it further,
  // before production launch.
  const { error: updateError } = await supabase.auth.admin.updateUserById(
    employee.id,
    {
      password: newPassword,
      email_confirm: true,
    }
  );

  if (updateError) {
    console.error("[employees] Test password update failed", updateError);
    return jsonError(getAuthErrorMessage(updateError), 500);
  }

  return NextResponse.json({ success: true });
}
