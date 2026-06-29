import { NextResponse } from "next/server";
import { getAdminContextForUserId } from "@/lib/auth/server";
import { isAdminRole } from "@/lib/auth/roles";
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

function getAppUrl(request: Request) {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (configuredUrl) return configuredUrl.replace(/\/$/, "");

  return new URL(request.url).origin;
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

  return "Unable to send password setup email.";
}

async function requireAdminContext(request: Request) {
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

  if (!profile || !profile.is_active || !isAdminRole(profile.role)) {
    return {
      response: jsonError("Only active admins or managers can manage employees.", 403),
      supabase: null,
      profile: null,
    };
  }

  return { response: null, supabase, profile };
}

export async function POST(request: Request) {
  const { response, supabase, profile } = await requireAdminContext(request);

  if (response) return response;

  let payload: { employee_id?: unknown };

  try {
    payload = (await request.json()) as { employee_id?: unknown };
  } catch (error) {
    console.error("[employees] Password setup payload parsing failed", error);
    return jsonError("Unable to send password setup email.", 400);
  }

  const employeeId = readString(payload.employee_id);

  if (!employeeId) {
    return jsonError("Choose an employee.", 400);
  }

  const { data: employee, error: employeeError } = await supabase
    .from("profiles")
    .select("id,email,company_id")
    .eq("id", employeeId)
    .eq("company_id", profile.company_id)
    .maybeSingle();

  if (employeeError) {
    console.error("[employees] Password setup employee lookup failed", employeeError);
    return jsonError("Unable to send password setup email.", 500);
  }

  if (!employee) {
    return jsonError("Employee not found.", 404);
  }

  const redirectTo = `${getAppUrl(request)}/reset-password`;
  const { error: resetError } = await supabase.auth.resetPasswordForEmail(
    employee.email,
    { redirectTo }
  );

  if (resetError) {
    console.error("[employees] Password setup email failed", resetError);
    return jsonError(getAuthErrorMessage(resetError), 500);
  }

  return NextResponse.json({ success: true });
}
