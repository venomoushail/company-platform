import { NextResponse } from "next/server";
import { getBearerToken, jsonError } from "@/lib/auth/api";
import {
  createAdminSupabaseClient,
  getSupabaseAdminConfig,
} from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { url, serviceRoleKey } = getSupabaseAdminConfig();

  if (!url || !serviceRoleKey) {
    return jsonError("Supabase admin environment is not configured.", 500);
  }

  const token = getBearerToken(request);

  if (!token) {
    return jsonError("You must be signed in to update last login.", 401);
  }

  const supabase = createAdminSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);

  if (userError || !userData.user) {
    return jsonError("Your session is invalid or expired.", 401);
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", userData.user.id)
    .select("id,last_login_at")
    .single();

  if (profileError) {
    console.error("[auth-last-login] Profile update failed", profileError);
    return jsonError("Unable to update last login.", 500);
  }

  return NextResponse.json({ profile });
}
