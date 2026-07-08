import { NextResponse } from "next/server";
import { getAdminContextForUserId } from "@/lib/auth/server";
import { isAdminRole } from "@/lib/auth/roles";
import {
  createAdminSupabaseClient,
  getSupabaseAdminConfig,
} from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type FieldErrors = Partial<Record<string, string>>;
type PatchBody = {
  status?: unknown;
};

function getBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) return null;

  return authHeader.slice("Bearer ".length).trim();
}

function jsonError(message: string, status: number, fieldErrors: FieldErrors = {}) {
  return NextResponse.json({ error: message, fieldErrors }, { status });
}

function logServerError(message: string, error: unknown) {
  console.error(`[training] ${message}`, error);
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
      response: jsonError("You must be signed in to manage training.", 401),
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

  if (!profile.is_active || !isAdminRole(profile.role)) {
    return {
      response: jsonError("Only active admins or managers can manage training.", 403),
      supabase: null,
      profile: null,
    };
  }

  return { response: null, supabase, profile };
}

async function getCompanyScopedModule(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  moduleId: string,
  companyId: string
) {
  return supabase
    .from("training_modules")
    .select("*")
    .eq("id", moduleId)
    .eq("company_id", companyId)
    .maybeSingle();
}

async function deleteTrainingModuleDependencies(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  moduleId: string,
  companyId: string
) {
  const [{ data: attempts, error: attemptsLookupError }, { data: questions, error: questionsLookupError }] =
    await Promise.all([
      supabase
        .from("quiz_attempts")
        .select("id")
        .eq("module_id", moduleId)
        .eq("company_id", companyId),
      supabase
        .from("quiz_questions")
        .select("id")
        .eq("module_id", moduleId)
        .eq("company_id", companyId),
    ]);

  if (attemptsLookupError) return { error: attemptsLookupError };
  if (questionsLookupError) return { error: questionsLookupError };

  const attemptIds = (attempts ?? []).map((attempt) => attempt.id);
  const questionIds = (questions ?? []).map((question) => question.id);

  if (attemptIds.length > 0) {
    const { error } = await supabase
      .from("quiz_attempt_answers")
      .delete()
      .in("attempt_id", attemptIds);

    if (error) return { error };
  }

  if (questionIds.length > 0) {
    const { error } = await supabase
      .from("quiz_attempt_answers")
      .delete()
      .in("question_id", questionIds);

    if (error) return { error };
  }

  const deleteSteps = [
    supabase
      .from("quiz_attempts")
      .delete()
      .eq("module_id", moduleId)
      .eq("company_id", companyId),
    supabase.from("training_assignments").delete().eq("module_id", moduleId),
    supabase
      .from("training_module_positions")
      .delete()
      .eq("module_id", moduleId)
      .eq("company_id", companyId),
    supabase
      .from("training_import_jobs")
      .update({ created_module_id: null })
      .eq("created_module_id", moduleId)
      .eq("company_id", companyId),
    supabase
      .from("training_slides")
      .delete()
      .eq("module_id", moduleId)
      .eq("company_id", companyId),
    supabase
      .from("quiz_questions")
      .delete()
      .eq("module_id", moduleId)
      .eq("company_id", companyId),
  ];

  for (const step of deleteSteps) {
    const { error } = await step;

    if (error) return { error };
  }

  return { error: null };
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ moduleId: string }> }
) {
  const { moduleId } = await context.params;
  const { response, supabase, profile } = await requireAdminContext(request);

  if (response) return response;

  const body = (await request.json().catch(() => null)) as PatchBody | null;

  if (body?.status !== "archived") {
    return jsonError("Only archive updates are supported for this endpoint.", 400, {
      status: "Choose archived.",
    });
  }

  const { data: module, error: moduleError } = await getCompanyScopedModule(
    supabase,
    moduleId,
    profile.company_id
  );

  if (moduleError) {
    logServerError("Training module archive lookup failed", moduleError);
    return jsonError("Unable to archive the training.", 500);
  }

  if (!module) {
    return jsonError("Training module not found.", 404);
  }

  if (module.status === "archived") {
    return NextResponse.json({ module });
  }

  const { data: archivedModule, error: archiveError } = await supabase
    .from("training_modules")
    .update({ status: "archived" })
    .eq("id", module.id)
    .eq("company_id", profile.company_id)
    .select("*")
    .single();

  if (archiveError || !archivedModule) {
    logServerError("Training module archive failed", archiveError);
    return jsonError("Unable to archive the training.", 500);
  }

  return NextResponse.json({ module: archivedModule });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ moduleId: string }> }
) {
  const { moduleId } = await context.params;
  const { response, supabase, profile } = await requireAdminContext(request);

  if (response) return response;

  const { data: module, error: moduleError } = await getCompanyScopedModule(
    supabase,
    moduleId,
    profile.company_id
  );

  if (moduleError) {
    logServerError("Training module delete lookup failed", moduleError);
    return jsonError("Unable to delete the training.", 500);
  }

  if (!module) {
    return jsonError("Training module not found.", 404);
  }

  if (module.status !== "draft") {
    return jsonError(
      "Published trainings cannot be deleted. Archive this training instead.",
      409
    );
  }

  const dependencyDeletion = await deleteTrainingModuleDependencies(
    supabase,
    module.id,
    profile.company_id
  );

  if (dependencyDeletion.error) {
    logServerError("Training dependency delete failed", dependencyDeletion.error);
    return jsonError("Unable to delete related training data.", 500);
  }

  const { error: deleteError } = await supabase
    .from("training_modules")
    .delete()
    .eq("id", module.id)
    .eq("company_id", profile.company_id);

  if (deleteError) {
    logServerError("Training module delete failed", deleteError);
    return jsonError("Unable to delete the training.", 500);
  }

  return NextResponse.json({ success: true });
}
