import { NextResponse } from "next/server";
import { getAdminContextForUserId } from "@/lib/auth/server";
import { isAdminRole } from "@/lib/auth/roles";
import {
  defaultPromptVersion,
  getRestaurantTrainingPromptBuilder,
  getRestaurantTrainingPromptVersion,
  isGenerationStyle,
  type GenerationStyle,
  type PromptVersion,
} from "@/lib/ai/prompts/restaurantTraining";
import {
  createAdminSupabaseClient,
  getSupabaseAdminConfig,
} from "@/lib/supabase/admin";
import {
  getGeneratedCurriculumRecord,
  type RecommendedTrainingModule,
} from "@/lib/training/curriculumBuilder";
import {
  generatedTrainingDraftSchema,
  normalizeGeneratedTrainingDraft,
} from "@/lib/training/importDraft";
import { saveGeneratedTrainingDraft } from "@/lib/training/saveGeneratedTrainingDraft";

export const dynamic = "force-dynamic";

type FieldErrors = Partial<Record<string, string>>;
type GenerateSelectedRequestBody = {
  selectedModuleOrders?: unknown;
  generationStyle?: unknown;
  promptVersion?: unknown;
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
      response: jsonError("You must be signed in to generate selected trainings.", 401),
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

function extractResponseText(responseJson: unknown) {
  if (!responseJson || typeof responseJson !== "object") return "";

  const outputText = (responseJson as { output_text?: unknown }).output_text;
  if (typeof outputText === "string") return outputText;

  const output = (responseJson as { output?: unknown }).output;
  if (!Array.isArray(output)) return "";

  return output
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];

      const content = (item as { content?: unknown }).content;
      if (!Array.isArray(content)) return [];

      return content
        .map((contentItem) => {
          if (!contentItem || typeof contentItem !== "object") return "";

          const text = (contentItem as { text?: unknown }).text;
          return typeof text === "string" ? text : "";
        })
        .filter(Boolean);
    })
    .join("");
}

function parseGeneratedDraftJson(responseText: string) {
  if (!responseText.trim()) {
    throw new Error("OpenAI returned an empty training draft.");
  }

  try {
    return JSON.parse(responseText) as unknown;
  } catch (error) {
    logServerError("OpenAI returned malformed training JSON", error);
    throw new Error("OpenAI returned malformed training JSON.");
  }
}

async function readGenerationOptions(request: Request) {
  const requestBody = (await request.json().catch(() => null)) as
    | GenerateSelectedRequestBody
    | null;
  const generationStyle = requestBody?.generationStyle;
  const promptVersion = requestBody?.promptVersion;
  const selectedModuleOrders = Array.isArray(requestBody?.selectedModuleOrders)
    ? requestBody.selectedModuleOrders
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
    : [];

  return {
    generationStyle: isGenerationStyle(generationStyle)
      ? generationStyle
      : ("standard" as GenerationStyle),
    promptVersion: getRestaurantTrainingPromptVersion(promptVersion),
    selectedModuleOrders,
  };
}

async function updateImportJob(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  jobId: string,
  companyId: string,
  values: {
    status: string;
    generated_json?: unknown | null;
    error_message?: string | null;
  }
) {
  return supabase
    .from("training_import_jobs")
    .update(values)
    .eq("id", jobId)
    .eq("company_id", companyId)
    .select("*")
    .single();
}

function buildModuleScopedSourceText(
  rawText: string,
  module: RecommendedTrainingModule
) {
  return `Generate one training module from a larger handbook source.

Selected module only:
- Title: ${module.title}
- Description: ${module.description}
- Category: ${module.category}
- Recommended audience: ${module.recommended_audience}
- Estimated minutes: ${module.estimated_minutes}
- Suggested slide count: ${module.suggested_slide_count}
- Suggested quiz question count: ${module.suggested_quiz_question_count}
- Source topic summary: ${module.source_topic_summary}

Important constraints:
- Generate only this selected module topic, not the entire handbook.
- Use the source document to support the content for this module.
- Do not include unrelated handbook topics unless they are necessary context for this module.
- Keep the title and category aligned with the selected module.

Full source document:
${rawText}`;
}

async function generateDraftForModule({
  module,
  rawText,
  generationStyle,
  promptVersion,
  model,
}: {
  module: RecommendedTrainingModule;
  rawText: string;
  generationStyle: GenerationStyle;
  promptVersion: PromptVersion;
  model: string;
}) {
  const promptBuilder = getRestaurantTrainingPromptBuilder(promptVersion);
  const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: promptBuilder(buildModuleScopedSourceText(rawText, module), generationStyle),
      text: {
        format: {
          type: "json_schema",
          name: "training_draft",
          schema: generatedTrainingDraftSchema,
          strict: true,
        },
      },
    }),
  });

  const responseJson = (await openAiResponse.json().catch(() => null)) as unknown;

  if (!openAiResponse.ok) {
    logServerError("OpenAI selected training generation failed", responseJson);
    throw new Error(`OpenAI was unable to generate "${module.title}".`);
  }

  const responseText = extractResponseText(responseJson);
  const parsedJson = parseGeneratedDraftJson(responseText);
  const draft = normalizeGeneratedTrainingDraft(parsedJson);

  if (!draft) {
    throw new Error(`OpenAI returned unexpected training JSON for "${module.title}".`);
  }

  return draft;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await context.params;
  const { response, supabase, profile } = await requireAdminContext(request);
  const { generationStyle, promptVersion, selectedModuleOrders } =
    await readGenerationOptions(request);
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

  if (response) return response;

  if (!profile.is_active || !isAdminRole(profile.role)) {
    return jsonError(
      "Only active admins or managers can generate selected trainings.",
      403
    );
  }

  if (!process.env.OPENAI_API_KEY) {
    return jsonError("Missing OPENAI_API_KEY. Add it to your server environment.", 500);
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

  if (!job.raw_text?.trim()) {
    return jsonError("Extracted text is required before generating trainings.", 400);
  }

  if (!["curriculum_ready", "modules_created"].includes(job.status)) {
    return jsonError("Review a curriculum before generating selected trainings.", 400);
  }

  const curriculumRecord = getGeneratedCurriculumRecord(job.generated_json);

  if (!curriculumRecord) {
    return jsonError("The detected curriculum is missing or malformed.", 400);
  }

  const selectedOrderSet = new Set(selectedModuleOrders);
  const selectedModules = curriculumRecord.curriculum.recommended_modules.filter(
    (module) => selectedOrderSet.has(module.module_order)
  );

  if (selectedModules.length === 0) {
    return jsonError("Select at least one curriculum module to generate.", 400);
  }

  const generatingResult = await updateImportJob(
    supabase,
    job.id,
    profile.company_id,
    {
      status: "modules_generating",
      error_message: null,
    }
  );

  if (generatingResult.error || !generatingResult.data) {
    logServerError(
      "Training import modules-generating status update failed",
      generatingResult.error
    );
    return jsonError("Unable to start selected training generation.", 500);
  }

  try {
    const createdModules: { id: string; title: string }[] = [];

    for (const selectedModule of selectedModules) {
      const draft = await generateDraftForModule({
        module: selectedModule,
        rawText: job.raw_text,
        generationStyle,
        promptVersion,
        model,
      });
      const { data: module, error: moduleError } = await saveGeneratedTrainingDraft({
        supabase,
        draft,
        companyId: profile.company_id,
        createdBy: profile.id,
      });

      if (moduleError || !module) {
        logServerError("Training import selected module save failed", moduleError);
        throw new Error(`Unable to save "${selectedModule.title}" as a draft.`);
      }

      createdModules.push({ id: module.id, title: module.title });
    }

    const createdModuleIds = [
      ...(curriculumRecord.created_module_ids ?? []),
      ...createdModules.map((module) => module.id),
    ];

    const updatedGeneratedJson = {
      ...curriculumRecord,
      generation_style: generationStyle,
      model,
      modules_generated_at: new Date().toISOString(),
      restaurant_training_prompt_version: promptVersion || defaultPromptVersion,
      // TODO: Replace created_module_ids metadata with an import_job_modules join table.
      created_module_ids: createdModuleIds,
    };

    const createdResult = await updateImportJob(supabase, job.id, profile.company_id, {
      status: "modules_created",
      generated_json: updatedGeneratedJson,
      error_message: null,
    });

    if (createdResult.error || !createdResult.data) {
      logServerError("Training import modules-created update failed", createdResult.error);
      return jsonError("Trainings were created, but the import job could not be updated.", 500);
    }

    return NextResponse.json({
      job: createdResult.data,
      modules: createdModules,
    });
  } catch (error) {
    logServerError("Selected training generation failed", error);

    const errorMessage =
      error instanceof Error && error.message
        ? error.message
        : "Unable to generate selected trainings.";

    const restoredResult = await updateImportJob(supabase, job.id, profile.company_id, {
      status: "curriculum_ready",
      error_message: errorMessage,
    });

    if (restoredResult.error || !restoredResult.data) {
      logServerError(
        "Training import selected generation failure update failed",
        restoredResult.error
      );
    }

    return jsonError(errorMessage, 500);
  }
}
