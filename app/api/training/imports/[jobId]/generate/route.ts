import { NextResponse } from "next/server";
import { getAdminContextForUserId } from "@/lib/auth/server";
import { isAdminRole } from "@/lib/auth/roles";
import {
  createAdminSupabaseClient,
  getSupabaseAdminConfig,
} from "@/lib/supabase/admin";
import {
  generatedTrainingDraftSchema,
  normalizeGeneratedTrainingDraft,
} from "@/lib/training/importDraft";

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

function buildTrainingPrompt(rawText: string) {
  return `You are an expert instructional designer creating employee training.

Generate a complete editable training draft from the source document.

Rules:
- Split the material naturally into lessons/slides.
- Create informative slide titles.
- Use paragraphs.
- Use bullet lists where appropriate.
- Keep each slide approximately 150-250 words.
- Preserve important information.
- Remove repetitive wording.
- Estimate course length in minutes.
- Create 5-10 quiz questions covering the most important material.
- Return valid JSON only.

JSON shape:
{
  "module": {
    "title": "",
    "description": "",
    "category": "",
    "estimated_minutes": 20,
    "passing_score": 80
  },
  "slides": [
    {
      "slide_order": 1,
      "title": "",
      "body": ""
    }
  ],
  "quiz": [
    {
      "question_order": 1,
      "question_text": "",
      "question_type": "multiple_choice",
      "answer_a": "",
      "answer_b": "",
      "answer_c": "",
      "answer_d": "",
      "correct_answer": "A",
      "explanation": ""
    }
  ]
}

Source document:
${rawText}`;
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

  if (!["text_ready", "draft_ready"].includes(job.status)) {
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
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content:
              "You are an expert instructional designer. Return only valid JSON.",
          },
          {
            role: "user",
            content: buildTrainingPrompt(job.raw_text),
          },
        ],
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
      logServerError("OpenAI training generation failed", responseJson);
      throw new Error("OpenAI was unable to generate the training draft.");
    }

    const responseText = extractResponseText(responseJson);
    const parsedJson = JSON.parse(responseText) as unknown;
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
        generated_json: draft,
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
      error instanceof Error && error.message
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
