import { NextResponse } from "next/server";
import { getAdminContextForUserId } from "@/lib/auth/server";
import { isAdminRole } from "@/lib/auth/roles";
import {
  curriculumBuilderPromptFamily,
  defaultCurriculumBuilderPromptVersion,
  getCurriculumBuilderPromptBuilder,
  getCurriculumBuilderPromptVersion,
} from "@/lib/ai/prompts/curriculumBuilder";
import {
  isGenerationStyle,
  type GenerationStyle,
} from "@/lib/ai/prompts/restaurantTraining";
import {
  createAdminSupabaseClient,
  getSupabaseAdminConfig,
} from "@/lib/supabase/admin";
import {
  generatedCurriculumSchema,
  normalizeGeneratedCurriculum,
} from "@/lib/training/curriculumBuilder";

export const dynamic = "force-dynamic";

type FieldErrors = Partial<Record<string, string>>;
type DetectRequestBody = {
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
      response: jsonError("You must be signed in to detect a curriculum.", 401),
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

function parseCurriculumJson(responseText: string) {
  if (!responseText.trim()) {
    throw new Error("OpenAI returned an empty curriculum.");
  }

  try {
    return JSON.parse(responseText) as unknown;
  } catch (error) {
    logServerError("OpenAI returned malformed curriculum JSON", error);
    throw new Error("OpenAI returned malformed curriculum JSON.");
  }
}

async function readDetectOptions(request: Request) {
  const requestBody = (await request.json().catch(() => null)) as
    | DetectRequestBody
    | null;
  const generationStyle = requestBody?.generationStyle;
  const promptVersion = requestBody?.promptVersion;

  return {
    generationStyle: isGenerationStyle(generationStyle)
      ? generationStyle
      : ("standard" as GenerationStyle),
    promptVersion: getCurriculumBuilderPromptVersion(promptVersion),
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

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await context.params;
  const { response, supabase, profile } = await requireAdminContext(request);
  const { generationStyle, promptVersion } = await readDetectOptions(request);
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const promptBuilder = getCurriculumBuilderPromptBuilder(promptVersion);

  if (response) return response;

  if (!profile.is_active || !isAdminRole(profile.role)) {
    return jsonError("Only active admins or managers can detect a curriculum.", 403);
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
    return jsonError("Extracted text is required before detecting a curriculum.", 400);
  }

  if (!["text_ready", "draft_ready", "curriculum_ready"].includes(job.status)) {
    return jsonError("Detect a curriculum after document text is ready.", 400);
  }

  const generatingResult = await updateImportJob(
    supabase,
    job.id,
    profile.company_id,
    {
      status: "curriculum_generating",
      error_message: null,
    }
  );

  if (generatingResult.error || !generatingResult.data) {
    logServerError(
      "Training import curriculum-generating status update failed",
      generatingResult.error
    );
    return jsonError("Unable to start curriculum detection.", 500);
  }

  try {
    const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: promptBuilder(job.raw_text, generationStyle),
        text: {
          format: {
            type: "json_schema",
            name: "curriculum_outline",
            schema: generatedCurriculumSchema,
            strict: true,
          },
        },
      }),
    });

    const responseJson = (await openAiResponse.json().catch(() => null)) as unknown;

    if (!openAiResponse.ok) {
      logServerError("OpenAI curriculum detection failed", responseJson);
      throw new Error("OpenAI was unable to detect a training curriculum.");
    }

    const responseText = extractResponseText(responseJson);
    const parsedJson = parseCurriculumJson(responseText);
    const curriculum = normalizeGeneratedCurriculum(parsedJson);

    if (!curriculum) {
      throw new Error("OpenAI returned curriculum JSON in an unexpected format.");
    }

    const readyResult = await updateImportJob(supabase, job.id, profile.company_id, {
      status: "curriculum_ready",
      generated_json: {
        mode: "curriculum_builder",
        prompt_family: curriculumBuilderPromptFamily,
        prompt_version: promptVersion || defaultCurriculumBuilderPromptVersion,
        generation_style: generationStyle,
        model,
        generated_at: new Date().toISOString(),
        curriculum,
      },
      error_message: null,
    });

    if (readyResult.error || !readyResult.data) {
      logServerError("Training import curriculum-ready update failed", readyResult.error);
      return jsonError("Unable to save the detected curriculum.", 500);
    }

    return NextResponse.json({ job: readyResult.data });
  } catch (error) {
    logServerError("AI curriculum detection failed", error);

    const errorMessage =
      error instanceof Error && error.message
        ? error.message
        : "Unable to detect a training curriculum.";

    const failedResult = await updateImportJob(supabase, job.id, profile.company_id, {
      status: "curriculum_failed",
      error_message: errorMessage,
    });

    if (failedResult.error || !failedResult.data) {
      logServerError(
        "Training import curriculum failure update failed",
        failedResult.error
      );
    }

    return jsonError(errorMessage, 500);
  }
}
