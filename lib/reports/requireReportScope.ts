import "server-only";

import { NextResponse } from "next/server";
import { getAdminContextForUserId } from "@/lib/auth/server";
import { getDataScopeForProfile } from "@/lib/auth/scope";
import {
  createAdminSupabaseClient,
  getSupabaseAdminConfig,
} from "@/lib/supabase/admin";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function requireReportScope(request: Request) {
  const { url, serviceRoleKey } = getSupabaseAdminConfig();
  if (!url || !serviceRoleKey) {
    return {
      response: jsonError("Reporting is not configured.", 500),
      supabase: null,
      scope: null,
    };
  }

  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : null;
  if (!token) {
    return {
      response: jsonError("You must be signed in to view reports.", 401),
      supabase: null,
      scope: null,
    };
  }

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return {
      response: jsonError("Your session is invalid or expired.", 401),
      supabase: null,
      scope: null,
    };
  }

  const { profile } = await getAdminContextForUserId(data.user.id);
  if (!profile || !profile.is_active || profile.role === "employee") {
    return {
      response: jsonError("You do not have access to employee reports.", 403),
      supabase: null,
      scope: null,
    };
  }

  return {
    response: null,
    supabase,
    scope: await getDataScopeForProfile(supabase, profile),
  };
}
