import { NextResponse } from "next/server";
import { createAdminSupabaseClient, getSupabaseAdminConfig } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function getBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) return null;

  return authHeader.slice("Bearer ".length).trim();
}

function getSupabaseUrlHostname(url: string | undefined) {
  if (!url) return "";

  try {
    return new URL(url).hostname;
  } catch {
    return "invalid-url";
  }
}

// TODO remove after Vercel auth debugging.
export async function GET(request: Request) {
  const authorizationHeader = request.headers.get("authorization");
  const token = getBearerToken(request);
  const { url, anonKey, serviceRoleKey } = getSupabaseAdminConfig();
  let getUserSuccess = false;
  let getUserErrorName = "";
  let getUserErrorMessage = "";
  let userId = "";

  if (token && url && serviceRoleKey) {
    try {
      const supabase = createAdminSupabaseClient();
      const { data, error } = await supabase.auth.getUser(token);

      if (error || !data.user) {
        getUserErrorName = error?.name ?? "";
        getUserErrorMessage = error?.message ?? "No user returned.";
      } else {
        getUserSuccess = true;
        userId = data.user.id;
      }
    } catch (error) {
      getUserErrorName = error instanceof Error ? error.name : "UnknownError";
      getUserErrorMessage =
        error instanceof Error ? error.message : "Unknown getUser failure.";
    }
  } else if (!token) {
    getUserErrorMessage = "No bearer token was provided.";
  } else if (!url || !serviceRoleKey) {
    getUserErrorMessage = "Supabase server environment variables are missing.";
  }

  return NextResponse.json({
    hasAuthorizationHeader: Boolean(authorizationHeader),
    authorizationStartsWithBearer:
      typeof authorizationHeader === "string" &&
      authorizationHeader.startsWith("Bearer "),
    tokenPrefix: token ? token.slice(0, 12) : "",
    tokenLength: token?.length ?? 0,
    supabaseUrlHostname: getSupabaseUrlHostname(url),
    anonKeyPresent: Boolean(anonKey),
    serviceRoleKeyPresent: Boolean(serviceRoleKey),
    nodeEnv: process.env.NODE_ENV ?? "",
    getUserSuccess,
    getUserErrorName,
    getUserErrorMessage,
    userId,
  });
}
