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
  generatedTrainingDraftSchema,
  generatedTrainingDraftV4Schema,
  normalizeGeneratedTrainingDraft,
} from "@/lib/training/importDraft";

export const dynamic = "force-dynamic";

type FieldErrors = Partial<Record<string, string>>;
type GenerateRequestBody = {
  generationStyle?: unknown;
  promptVersion?: unknown;
};
type GenerationOptions = {
  generationStyle: GenerationStyle;
  promptVersion: PromptVersion;
};
type OpenAiErrorDetails = {
  status: number;
  statusText: string;
  requestId: string | null;
  responseJson: unknown | null;
  responseText: string | null;
  errorType: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};

class OpenAiGenerationError extends Error {
  constructor(
    message: string,
    readonly developmentMessage: string
  ) {
    super(message);
    this.name = "OpenAiGenerationError";
  }
}

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

function readOpenAiErrorField(errorObject: unknown, field: string) {
  if (!errorObject || typeof errorObject !== "object") return null;

  const value = (errorObject as Record<string, unknown>)[field];
  return typeof value === "string" && value.trim() ? value : null;
}

async function readOpenAiResponse(response: Response) {
  const responseText = await response.text().catch(() => "");

  if (!responseText.trim()) {
    return {
      responseJson: null,
      responseText: null,
    };
  }

  try {
    return {
      responseJson: JSON.parse(responseText) as unknown,
      responseText: null,
    };
  } catch {
    return {
      responseJson: null,
      responseText,
    };
  }
}

function getOpenAiErrorDetails(
  response: Response,
  responseJson: unknown,
  responseText: string | null
): OpenAiErrorDetails {
  const errorObject =
    responseJson && typeof responseJson === "object"
      ? (responseJson as { error?: unknown }).error
      : null;

  return {
    status: response.status,
    statusText: response.statusText,
    requestId: response.headers.get("x-request-id"),
    responseJson,
    responseText,
    errorType: readOpenAiErrorField(errorObject, "type"),
    errorCode: readOpenAiErrorField(errorObject, "code"),
    errorMessage: readOpenAiErrorField(errorObject, "message"),
  };
}

function formatOpenAiDevelopmentError(details: OpenAiErrorDetails) {
  const lines = [
    "OpenAI Error",
    `Status: ${details.status}${details.statusText ? ` ${details.statusText}` : ""}`,
  ];

  if (details.errorType) {
    lines.push("", "Type:", details.errorType);
  }

  if (details.errorCode) {
    lines.push("", "Code:", details.errorCode);
  }

  if (details.errorMessage) {
    lines.push("", "Message:", details.errorMessage);
  }

  if (details.requestId) {
    lines.push("", "Request ID:", details.requestId);
  }

  if (!details.errorMessage && details.responseText) {
    lines.push("", "Response:", details.responseText);
  }

  return lines.join("\n");
}

function createOpenAiGenerationError(details: OpenAiErrorDetails) {
  return new OpenAiGenerationError(
    "OpenAI was unable to generate the training draft.",
    formatOpenAiDevelopmentError(details)
  );
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
      response: jsonError("You must be signed in to generate training.", 401),
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

async function readGenerationOptions(request: Request): Promise<GenerationOptions> {
  const requestBody = (await request.json().catch(() => null)) as
    | GenerateRequestBody
    | null;
  const generationStyle = requestBody?.generationStyle;
  const promptVersion = requestBody?.promptVersion;

  return {
    generationStyle: isGenerationStyle(generationStyle)
      ? generationStyle
      : "standard",
    promptVersion: getRestaurantTrainingPromptVersion(promptVersion),
  };
}

async function updateImportJob(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  jobId: string,
  companyId: string,
  values: {
    status: "text_ready" | "generating" | "draft_ready";
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
  const { generationStyle, promptVersion } = await readGenerationOptions(request);
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const promptBuilder = getRestaurantTrainingPromptBuilder(promptVersion);
  const draftSchema =
    promptVersion === "v4" ? generatedTrainingDraftV4Schema : generatedTrainingDraftSchema;

  if (response) return response;

  if (!profile.is_active || !isAdminRole(profile.role)) {
    return jsonError("Only active admins or managers can generate training.", 403);
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
    return jsonError("Extracted text is required before generating training.", 400);
  }

  if (!["text_ready", "draft_ready", "draft_created"].includes(job.status)) {
    return jsonError("Generate training after document text is ready.", 400);
  }

  const generatingResult = await updateImportJob(
    supabase,
    job.id,
    profile.company_id,
    {
      status: "generating",
      error_message: null,
    }
  );

  if (generatingResult.error || !generatingResult.data) {
    logServerError("Training import generating status update failed", generatingResult.error);
    return jsonError("Unable to start AI training generation.", 500);
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
            name: "training_draft",
            schema: draftSchema,
            strict: true,
          },
        },
      }),
    });

    const { responseJson, responseText: rawResponseText } =
      await readOpenAiResponse(openAiResponse);

    if (!openAiResponse.ok) {
      const details = getOpenAiErrorDetails(
        openAiResponse,
        responseJson,
        rawResponseText
      );
      logServerError("OpenAI training generation failed", details);
      throw createOpenAiGenerationError(details);
    }

    const generatedDraftText = extractResponseText(responseJson);
    const parsedJson = parseGeneratedDraftJson(generatedDraftText);
    const draft = normalizeGeneratedTrainingDraft(parsedJson);

    if (!draft) {
      throw new Error("OpenAI returned training JSON in an unexpected format.");
    }

    const draftReadyResult = await updateImportJob(
      supabase,
      job.id,
      profile.company_id,
      {
        status: "draft_ready",
        // TODO: Move generation metadata into a history table if one document needs multiple saved generations.
        generated_json: {
          prompt_version: promptVersion || defaultPromptVersion,
          generation_style: generationStyle,
          model,
          generated_at: new Date().toISOString(),
          draft,
        },
        error_message: null,
      }
    );

    if (draftReadyResult.error || !draftReadyResult.data) {
      logServerError("Training import draft-ready update failed", draftReadyResult.error);
      return jsonError("Unable to save the generated training draft.", 500);
    }

    return NextResponse.json({ job: draftReadyResult.data });
  } catch (error) {
    logServerError("AI training generation failed", error);

    const errorMessage =
      error instanceof OpenAiGenerationError
        ? process.env.NODE_ENV === "development"
          ? error.developmentMessage
          : error.message
        : error instanceof Error && error.message
        ? error.message
        : "Unable to generate the training draft.";

    const restoredResult = await updateImportJob(
      supabase,
      job.id,
      profile.company_id,
      {
        status: "text_ready",
        error_message: errorMessage,
      }
    );

    if (restoredResult.error || !restoredResult.data) {
      logServerError("Training import generation failure update failed", restoredResult.error);
    }

    return jsonError(errorMessage, 500);
  }
}
