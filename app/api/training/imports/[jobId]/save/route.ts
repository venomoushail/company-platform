import { NextResponse } from "next/server";
import { getAdminContextForUserId } from "@/lib/auth/server";
import { isAdminRole } from "@/lib/auth/roles";
import {
  createAdminSupabaseClient,
  getSupabaseAdminConfig,
} from "@/lib/supabase/admin";
import {
  normalizeGeneratedTrainingDraft,
} from "@/lib/training/importDraft";
import { saveGeneratedTrainingDraft } from "@/lib/training/saveGeneratedTrainingDraft";

export const dynamic = "force-dynamic";

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
      response: jsonError("You must be signed in to save training drafts.", 401),
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

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await context.params;
  const { response, supabase, profile } = await requireAdminContext(request);

  if (response) return response;

  if (!profile.is_active || !isAdminRole(profile.role)) {
    return jsonError("Only active admins or managers can save training drafts.", 403);
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

  if (job.created_module_id && job.status === "draft_created") {
    return NextResponse.json({
      job,
      moduleId: job.created_module_id,
    });
  }

  if (job.status !== "draft_ready") {
    return jsonError("Generate and review an AI draft before saving.", 400);
  }

  const draft = normalizeGeneratedTrainingDraft(job.generated_json);

  if (!draft) {
    return jsonError("The generated training draft is missing or malformed.", 400);
  }

  const { data: module, error: moduleError } = await saveGeneratedTrainingDraft({
    supabase,
    draft,
    companyId: profile.company_id,
    createdBy: profile.id,
  });

  if (moduleError || !module) {
    logServerError("Training import module insert failed", moduleError);
    return jsonError("Unable to save the training draft.", 500);
  }

  const { data: updatedJob, error: updateError } = await supabase
    .from("training_import_jobs")
    .update({
      created_module_id: module.id,
      status: "draft_created",
      error_message: null,
    })
    .eq("id", job.id)
    .eq("company_id", profile.company_id)
    .select("*")
    .single();

  if (updateError || !updatedJob) {
    logServerError("Training import draft-created update failed", updateError);
    return jsonError("Training draft saved, but the import job could not be updated.", 500);
  }

  return NextResponse.json({
    job: updatedJob,
    moduleId: module.id,
  });
}
