import { NextResponse } from "next/server";
import { getAdminContextForUserId } from "@/lib/auth/server";
import { isAdminRole } from "@/lib/auth/roles";
import {
  createAdminSupabaseClient,
  getSupabaseAdminConfig,
} from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type FieldErrors = Partial<Record<string, string>>;

function getBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) return null;

  return authHeader.slice("Bearer ".length).trim();
}

function jsonError(message: string, status: number, fieldErrors: FieldErrors = {}) {
  return NextResponse.json({ error: message, fieldErrors }, { status });
}

function logServerError(message: string, error: unknown) {
  console.error(`[training-imports] ${message}`, error);
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
      response: jsonError("You must be signed in to manage imports.", 401),
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

  return { response: null, supabase, profile };
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await context.params;
  const { response, supabase, profile } = await requireAdminContext(request);

  if (response) return response;

  if (!profile.is_active || !isAdminRole(profile.role)) {
    return jsonError("Only active admins or managers can delete imports.", 403);
  }

  const { data: job, error: jobError } = await supabase
    .from("training_import_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("company_id", profile.company_id)
    .maybeSingle();

  if (jobError) {
    logServerError("Training import job lookup failed", jobError);
    return jsonError("Unable to load the import job.", 500);
  }

  if (!job) {
    return jsonError("Training import job not found.", 404);
  }

  if (job.created_module_id || job.status === "modules_created") {
    return jsonError("This import already created a draft training module.", 409);
  }

  const { error: deleteError } = await supabase
    .from("training_import_jobs")
    .delete()
    .eq("id", job.id)
    .eq("company_id", profile.company_id);

  if (deleteError) {
    logServerError("Training import job delete failed", deleteError);
    return jsonError("Unable to delete the import job.", 500);
  }

  if (job.file_path) {
    const { error: storageError } = await supabase.storage
      .from("training-imports")
      .remove([job.file_path]);

    if (storageError) {
      logServerError("Training import storage delete failed", storageError);
    }
  }

  return NextResponse.json({ success: true });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await context.params;
  const { response, supabase, profile } = await requireAdminContext(request);

  if (response) return response;

  if (!profile.is_active || !isAdminRole(profile.role)) {
    return jsonError("Only active admins or managers can update imports.", 403);
  }

  let body: { rawText?: unknown };

  try {
    body = (await request.json()) as { rawText?: unknown };
  } catch (error) {
    logServerError("Training import manual text parsing failed", error);
    return jsonError("Unable to read pasted text.", 400);
  }

  const rawText = typeof body.rawText === "string" ? body.rawText.trim() : "";

  if (rawText.length < 20) {
    return jsonError("Paste at least 20 characters of document text.", 400, {
      rawText: "Paste at least 20 characters of document text.",
    });
  }

  const { data: job, error } = await supabase
    .from("training_import_jobs")
    .update({
      raw_text: rawText,
      status: "text_ready",
      error_message: null,
      extraction_method: "manual_paste",
      extraction_confidence: 1,
      page_count: null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("company_id", profile.company_id)
    .select("*")
    .single();

  if (error || !job) {
    logServerError("Training import manual text update failed", error);
    return jsonError("Unable to save pasted document text.", 500);
  }

  return NextResponse.json({ job });
}
