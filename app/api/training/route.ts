import { NextResponse } from "next/server";
import { getAdminContextForUserId } from "@/lib/auth/server";
import { isAdminRole } from "@/lib/auth/roles";
import {
  createAdminSupabaseClient,
  getSupabaseAdminConfig,
} from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type SlidePayload = {
  title?: unknown;
  body?: unknown;
  image_url?: unknown;
  slide_type?: unknown;
  speaker_notes?: unknown;
  estimated_seconds?: unknown;
};

type QuizQuestionPayload = {
  question_text?: unknown;
  question_type?: unknown;
  answer_a?: unknown;
  answer_b?: unknown;
  answer_c?: unknown;
  answer_d?: unknown;
  correct_answer?: unknown;
  points?: unknown;
  explanation?: unknown;
};

type TrainingPayload = {
  id?: unknown;
  title?: unknown;
  description?: unknown;
  category?: unknown;
  training_audience?: unknown;
  passing_score?: unknown;
  estimated_minutes?: unknown;
  status?: unknown;
  allow_retake?: unknown;
  max_attempts?: unknown;
  renewal_period_days?: unknown;
  days_allowed?: unknown;
  assigned_position_ids?: unknown;
  slides?: unknown;
  quiz_questions?: unknown;
};

const validStatuses = new Set(["draft", "published", "archived"]);
const validAudiences = new Set(["all", "position_specific"]);
const validQuestionTypes = new Set(["multiple_choice", "true_false"]);
const validCorrectAnswers = new Set(["A", "B", "C", "D"]);

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
      response: jsonError("You must be signed in to access training.", 401),
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

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readNullableString(value: unknown) {
  const stringValue = readString(value);
  return stringValue || null;
}

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function readInteger(value: unknown, fallback: number | null) {
  if (value === null || value === "") return fallback;

  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) return fallback;

  return Math.trunc(numberValue);
}

function readRequiredInteger(value: unknown, fallback: number) {
  return readInteger(value, fallback) ?? fallback;
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function validateSlides(value: unknown, fieldErrors: FieldErrors) {
  if (!Array.isArray(value) || value.length === 0) {
    fieldErrors.slides = "Add at least one slide.";
    return [];
  }

  return value.map((slide, index) => {
    const slidePayload = (slide ?? {}) as SlidePayload;
    const title = readString(slidePayload.title) || `Slide ${index + 1}`;
    const estimatedSeconds = readInteger(slidePayload.estimated_seconds, null);

    if (estimatedSeconds !== null && estimatedSeconds < 0) {
      fieldErrors[`slides.${index}.estimated_seconds`] =
        "Estimated seconds must be 0 or greater.";
    }

    return {
      slide_order: index + 1,
      title,
      body: readString(slidePayload.body),
      image_url: readNullableString(slidePayload.image_url),
      slide_type: readString(slidePayload.slide_type) || "content",
      speaker_notes: readNullableString(slidePayload.speaker_notes),
      estimated_seconds: estimatedSeconds,
      is_active: true,
    };
  });
}

function validateQuizQuestions(value: unknown, fieldErrors: FieldErrors) {
  if (!Array.isArray(value)) return [];

  return value.map((question, index) => {
    const questionPayload = (question ?? {}) as QuizQuestionPayload;
    const questionType = readString(questionPayload.question_type) || "multiple_choice";
    const normalizedType = validQuestionTypes.has(questionType)
      ? questionType
      : "multiple_choice";
    const correctAnswer = readString(questionPayload.correct_answer).toUpperCase();
    const answerA =
      normalizedType === "true_false"
        ? "True"
        : readString(questionPayload.answer_a);
    const answerB =
      normalizedType === "true_false"
        ? "False"
        : readString(questionPayload.answer_b);
    const answerC =
      normalizedType === "true_false" ? null : readNullableString(questionPayload.answer_c);
    const answerD =
      normalizedType === "true_false" ? null : readNullableString(questionPayload.answer_d);
    const points = readRequiredInteger(questionPayload.points, 1);

    if (!readString(questionPayload.question_text)) {
      fieldErrors[`quiz_questions.${index}.question_text`] =
        "Question text is required.";
    }

    if (!answerA) {
      fieldErrors[`quiz_questions.${index}.answer_a`] = "Answer A is required.";
    }

    if (!answerB) {
      fieldErrors[`quiz_questions.${index}.answer_b`] = "Answer B is required.";
    }

    if (normalizedType === "multiple_choice") {
      if (!answerC) {
        fieldErrors[`quiz_questions.${index}.answer_c`] = "Answer C is required.";
      }

      if (!answerD) {
        fieldErrors[`quiz_questions.${index}.answer_d`] = "Answer D is required.";
      }
    }

    if (
      !validCorrectAnswers.has(correctAnswer) ||
      (normalizedType === "true_false" && !["A", "B"].includes(correctAnswer))
    ) {
      fieldErrors[`quiz_questions.${index}.correct_answer`] =
        "Choose a valid correct answer.";
    }

    if (points < 1) {
      fieldErrors[`quiz_questions.${index}.points`] = "Points must be at least 1.";
    }

    return {
      question_text: readString(questionPayload.question_text),
      question_type: normalizedType,
      answer_a: answerA,
      answer_b: answerB,
      answer_c: answerC,
      answer_d: answerD,
      correct_answer: correctAnswer || "A",
      points,
      question_order: index + 1,
      explanation: readNullableString(questionPayload.explanation),
      is_active: true,
    };
  });
}

function validateTrainingPayload(payload: TrainingPayload) {
  const fieldErrors: FieldErrors = {};
  const title = readString(payload.title);
  const passingScore = readRequiredInteger(payload.passing_score, 80);
  const estimatedMinutes = readInteger(payload.estimated_minutes, null);
  const maxAttempts = readInteger(payload.max_attempts, null);
  const renewalPeriodDays = readInteger(payload.renewal_period_days, null);
  const daysAllowed = readInteger(payload.days_allowed, null);
  const status = readString(payload.status).toLowerCase() || "draft";
  const normalizedStatus = validStatuses.has(status) ? status : "draft";
  const audience = readString(payload.training_audience) || "all";
  const normalizedAudience = validAudiences.has(audience) ? audience : "all";
  const assignedPositionIds = Array.from(
    new Set(readStringArray(payload.assigned_position_ids))
  );
  const slides = validateSlides(payload.slides, fieldErrors);
  const quizQuestions = validateQuizQuestions(payload.quiz_questions, fieldErrors);

  if (!title) fieldErrors.title = "Title is required.";

  if (passingScore < 0 || passingScore > 100) {
    fieldErrors.passing_score = "Passing score must be between 0 and 100.";
  }

  if (estimatedMinutes !== null && estimatedMinutes < 0) {
    fieldErrors.estimated_minutes = "Estimated minutes must be 0 or greater.";
  }

  if (maxAttempts !== null && maxAttempts < 1) {
    fieldErrors.max_attempts = "Max attempts must be at least 1.";
  }

  if (renewalPeriodDays !== null && renewalPeriodDays < 1) {
    fieldErrors.renewal_period_days = "Renewal period must be at least 1 day.";
  }

  if (daysAllowed !== null && daysAllowed < 1) {
    fieldErrors.days_allowed = "Days allowed must be greater than 0.";
  }

  if (normalizedAudience === "position_specific" && assignedPositionIds.length === 0) {
    fieldErrors.assigned_position_ids =
      "Choose at least one assigned position for position-specific training.";
  }

  return {
    values: {
      title,
      description: readNullableString(payload.description),
      category: readNullableString(payload.category),
      training_audience: normalizedAudience,
      passing_score: passingScore,
      estimated_minutes: estimatedMinutes,
      status: normalizedStatus,
      allow_retake: readBoolean(payload.allow_retake, true),
      max_attempts: maxAttempts,
      renewal_period_days: renewalPeriodDays,
      days_allowed: daysAllowed,
      assignedPositionIds:
        normalizedAudience === "position_specific" ? assignedPositionIds : [],
      slides,
      quizQuestions,
    },
    fieldErrors,
  };
}

async function fetchActivePositions(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  companyId: string
) {
  return supabase
    .from("positions")
    .select("*")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("name", { ascending: true });
}

async function validateAssignedPositions(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  companyId: string,
  positionIds: string[]
) {
  if (positionIds.length === 0) return { response: null };

  const { data, error } = await supabase
    .from("positions")
    .select("id")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .in("id", positionIds);

  if (error) {
    logServerError("Assigned position validation failed", error);
    return { response: jsonError("Unable to validate assigned positions.", 500) };
  }

  if ((data?.length ?? 0) !== positionIds.length) {
    return {
      response: jsonError("Choose valid assigned positions.", 400, {
        assigned_position_ids: "Choose valid assigned positions.",
      }),
    };
  }

  return { response: null };
}

async function fetchTrainingDetail(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  moduleId: string,
  companyId: string
) {
  const { data: module, error: moduleError } = await supabase
    .from("training_modules")
    .select("*")
    .eq("id", moduleId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (moduleError) {
    logServerError("Training module fetch failed", moduleError);
    return { response: jsonError(moduleError.message, 500), data: null };
  }

  if (!module) {
    return { response: jsonError("Training module not found.", 404), data: null };
  }

  const [slidesResult, questionsResult] = await Promise.all([
    supabase
      .from("training_slides")
      .select("*")
      .eq("module_id", module.id)
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("slide_order", { ascending: true }),
    supabase
      .from("quiz_questions")
      .select("*")
      .eq("module_id", module.id)
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("question_order", { ascending: true }),
  ]);

  if (slidesResult.error) {
    logServerError("Training slides fetch failed", slidesResult.error);
    return { response: jsonError(slidesResult.error.message, 500), data: null };
  }

  if (questionsResult.error) {
    logServerError("Quiz questions fetch failed", questionsResult.error);
    return { response: jsonError(questionsResult.error.message, 500), data: null };
  }

  const [positionsResult, modulePositionsResult] = await Promise.all([
    fetchActivePositions(supabase, companyId),
    supabase
      .from("training_module_positions")
      .select("position_id")
      .eq("module_id", module.id)
      .eq("company_id", companyId),
  ]);

  if (positionsResult.error) {
    logServerError("Training positions fetch failed", positionsResult.error);
    return { response: jsonError(positionsResult.error.message, 500), data: null };
  }

  if (modulePositionsResult.error) {
    logServerError(
      "Training module positions fetch failed",
      modulePositionsResult.error
    );
    return {
      response: jsonError("Unable to load assigned positions.", 500),
      data: null,
    };
  }

  return {
    response: null,
    data: {
      module,
      slides: slidesResult.data ?? [],
      quiz_questions: questionsResult.data ?? [],
      positions: positionsResult.data ?? [],
      selected_position_ids: (modulePositionsResult.data ?? []).map(
        (assignment) => assignment.position_id
      ),
    },
  };
}

async function replaceTrainingModulePositions(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  moduleId: string,
  companyId: string,
  positionIds: string[]
) {
  const { error: deleteError } = await supabase
    .from("training_module_positions")
    .delete()
    .eq("module_id", moduleId)
    .eq("company_id", companyId);

  if (deleteError) return { error: deleteError };

  if (positionIds.length === 0) return { error: null };

  const { error: insertError } = await supabase
    .from("training_module_positions")
    .insert(
      positionIds.map((positionId) => ({
        module_id: moduleId,
        position_id: positionId,
        company_id: companyId,
      }))
    );

  return { error: insertError };
}

async function replaceTrainingChildren(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  moduleId: string,
  companyId: string,
  slides: ReturnType<typeof validateSlides>,
  quizQuestions: ReturnType<typeof validateQuizQuestions>
) {
  const [deleteSlidesResult, deleteQuestionsResult] = await Promise.all([
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
  ]);

  if (deleteSlidesResult.error) {
    return { error: deleteSlidesResult.error };
  }

  if (deleteQuestionsResult.error) {
    return { error: deleteQuestionsResult.error };
  }

  if (slides.length > 0) {
    const { error: slidesInsertError } = await supabase
      .from("training_slides")
      .insert(
        slides.map((slide) => ({
          ...slide,
          module_id: moduleId,
          company_id: companyId,
        }))
      );

    if (slidesInsertError) return { error: slidesInsertError };
  }

  if (quizQuestions.length > 0) {
    const { error: questionsInsertError } = await supabase
      .from("quiz_questions")
      .insert(
        quizQuestions.map((question) => ({
          ...question,
          module_id: moduleId,
          company_id: companyId,
        }))
      );

    if (questionsInsertError) return { error: questionsInsertError };
  }

  return { error: null };
}

export async function GET(request: Request) {
  const { response, supabase, profile } = await requireAdminContext(request);

  if (response) return response;

  const searchParams = new URL(request.url).searchParams;
  const moduleId = searchParams.get("id");
  const metadata = searchParams.get("metadata");

  if (metadata === "audience") {
    const { data: positions, error } = await fetchActivePositions(
      supabase,
      profile.company_id
    );

    if (error) {
      logServerError("Training positions fetch failed", error);
      return jsonError(error.message, 500);
    }

    return NextResponse.json({
      positions: positions ?? [],
    });
  }

  if (moduleId) {
    const detail = await fetchTrainingDetail(supabase, moduleId, profile.company_id);
    if (detail.response) return detail.response;

    return NextResponse.json(detail.data);
  }

  const { data: modules, error } = await supabase
    .from("training_modules")
    .select("*")
    .eq("company_id", profile.company_id)
    .order("updated_at", { ascending: false });

  if (error) {
    logServerError("Training modules fetch failed", error);
    return jsonError(error.message, 500);
  }

  return NextResponse.json({ modules: modules ?? [] });
}

export async function POST(request: Request) {
  const { response, supabase, profile } = await requireAdminContext(request);

  if (response) return response;

  if (!profile.is_active || !isAdminRole(profile.role)) {
    return jsonError("Only active admins or managers can create trainings.", 403);
  }

  let payload: TrainingPayload;

  try {
    payload = (await request.json()) as TrainingPayload;
  } catch (error) {
    logServerError("Training payload parsing failed", error);
    return jsonError("Unable to save training. Please try again.", 400);
  }

  const { values, fieldErrors } = validateTrainingPayload(payload);

  if (Object.keys(fieldErrors).length > 0) {
    return jsonError("Fix the highlighted fields.", 400, fieldErrors);
  }

  const positionValidation = await validateAssignedPositions(
    supabase,
    profile.company_id,
    values.assignedPositionIds
  );

  if (positionValidation.response) return positionValidation.response;

  const { data: module, error: insertError } = await supabase
    .from("training_modules")
    .insert({
      title: values.title,
      description: values.description,
      category: values.category,
      training_audience: values.training_audience,
      passing_score: values.passing_score,
      estimated_minutes: values.estimated_minutes,
      status: values.status,
      allow_retake: values.allow_retake,
      max_attempts: values.max_attempts,
      renewal_period_days: values.renewal_period_days,
      days_allowed: values.days_allowed,
      company_id: profile.company_id,
      created_by: profile.id,
    })
    .select("*")
    .single();

  if (insertError || !module) {
    logServerError("Training module insert failed", insertError);
    return jsonError("Unable to save training. Please try again.", 500);
  }

  const replacement = await replaceTrainingChildren(
    supabase,
    module.id,
    profile.company_id,
    values.slides,
    values.quizQuestions
  );

  if (replacement.error) {
    logServerError("Training child insert failed", replacement.error);
    await supabase
      .from("training_modules")
      .delete()
      .eq("id", module.id)
      .eq("company_id", profile.company_id);
    return jsonError("Unable to save slides or quiz questions.", 500);
  }

  const positionReplacement = await replaceTrainingModulePositions(
    supabase,
    module.id,
    profile.company_id,
    values.assignedPositionIds
  );

  if (positionReplacement.error) {
    logServerError("Training module position insert failed", positionReplacement.error);
    await supabase
      .from("training_modules")
      .delete()
      .eq("id", module.id)
      .eq("company_id", profile.company_id);
    return jsonError("Unable to save assigned positions.", 500);
  }

  const detail = await fetchTrainingDetail(supabase, module.id, profile.company_id);
  if (detail.response) return detail.response;

  return NextResponse.json(detail.data, { status: 201 });
}

export async function PATCH(request: Request) {
  const { response, supabase, profile } = await requireAdminContext(request);

  if (response) return response;

  if (!profile.is_active || !isAdminRole(profile.role)) {
    return jsonError("Only active admins or managers can edit trainings.", 403);
  }

  let payload: TrainingPayload;

  try {
    payload = (await request.json()) as TrainingPayload;
  } catch (error) {
    logServerError("Training update payload parsing failed", error);
    return jsonError("Unable to update training. Please try again.", 400);
  }

  const moduleId = readString(payload.id);

  if (!moduleId) {
    return jsonError("Choose a training module to update.", 400, {
      id: "Choose a training module to update.",
    });
  }

  const { values, fieldErrors } = validateTrainingPayload(payload);

  if (Object.keys(fieldErrors).length > 0) {
    return jsonError("Fix the highlighted fields.", 400, fieldErrors);
  }

  const positionValidation = await validateAssignedPositions(
    supabase,
    profile.company_id,
    values.assignedPositionIds
  );

  if (positionValidation.response) return positionValidation.response;

  const { data: existingModule, error: existingModuleError } = await supabase
    .from("training_modules")
    .select("id")
    .eq("id", moduleId)
    .eq("company_id", profile.company_id)
    .maybeSingle();

  if (existingModuleError) {
    logServerError("Training module lookup failed", existingModuleError);
    return jsonError("Unable to update training. Please try again.", 500);
  }

  if (!existingModule) {
    return jsonError("Training module not found.", 404);
  }

  const { error: updateError } = await supabase
    .from("training_modules")
    .update({
      title: values.title,
      description: values.description,
      category: values.category,
      training_audience: values.training_audience,
      passing_score: values.passing_score,
      estimated_minutes: values.estimated_minutes,
      status: values.status,
      allow_retake: values.allow_retake,
      max_attempts: values.max_attempts,
      renewal_period_days: values.renewal_period_days,
      days_allowed: values.days_allowed,
    })
    .eq("id", moduleId)
    .eq("company_id", profile.company_id);

  if (updateError) {
    logServerError("Training module update failed", updateError);
    return jsonError("Unable to update training. Please try again.", 500);
  }

  const replacement = await replaceTrainingChildren(
    supabase,
    moduleId,
    profile.company_id,
    values.slides,
    values.quizQuestions
  );

  if (replacement.error) {
    logServerError("Training child replacement failed", replacement.error);
    return jsonError("Unable to update slides or quiz questions.", 500);
  }

  const positionReplacement = await replaceTrainingModulePositions(
    supabase,
    moduleId,
    profile.company_id,
    values.assignedPositionIds
  );

  if (positionReplacement.error) {
    logServerError(
      "Training module position replacement failed",
      positionReplacement.error
    );
    return jsonError("Unable to update assigned positions.", 500);
  }

  const detail = await fetchTrainingDetail(supabase, moduleId, profile.company_id);
  if (detail.response) return detail.response;

  return NextResponse.json(detail.data);
}
