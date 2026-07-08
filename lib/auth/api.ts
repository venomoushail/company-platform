import "server-only";

import { NextResponse } from "next/server";
import { getAdminContextForUserId } from "@/lib/auth/server";
import { getDataScopeForProfile } from "@/lib/auth/scope";
import {
  createAdminSupabaseClient,
  getSupabaseAdminConfig,
} from "@/lib/supabase/admin";

export function getBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) return null;

  return authHeader.slice("Bearer ".length).trim();
}

export function jsonError(
  message: string,
  status: number,
  fieldErrors: Partial<Record<string, string>> = {}
) {
  return NextResponse.json({ error: message, fieldErrors }, { status });
}

export async function requireAdminAreaContext(
  request: Request,
  areaName: string
) {
  const { url, serviceRoleKey } = getSupabaseAdminConfig();

  if (!url || !serviceRoleKey) {
    return {
      response: jsonError("Supabase admin environment is not configured.", 500),
      supabase: null,
      profile: null,
      scope: null,
    };
  }

  const token = getBearerToken(request);

  if (!token) {
    return {
      response: jsonError(`You must be signed in to access ${areaName}.`, 401),
      supabase: null,
      profile: null,
      scope: null,
    };
  }

  const supabase = createAdminSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);

  if (userError || !userData.user) {
    return {
      response: jsonError("Your session is invalid or expired.", 401),
      supabase: null,
      profile: null,
      scope: null,
    };
  }

  const { profile } = await getAdminContextForUserId(userData.user.id);

  if (!profile) {
    return {
      response: jsonError("You do not have access to this admin area.", 403),
      supabase: null,
      profile: null,
      scope: null,
    };
  }

  return {
    response: null,
    supabase,
    profile,
    scope: await getDataScopeForProfile(supabase, profile),
  };
}
