import { NextResponse } from "next/server";
import {
  isPingramEmailConfigured,
  sendTrainingCompletionEmail,
} from "@/lib/email/pingram";
import {
  createAdminSupabaseClient,
  getSupabaseAdminConfig,
} from "@/lib/supabase/admin";
import type {
  Location,
  Profile,
  QuizAttempt,
  QuizQuestionRow,
  TrainingAssignment,
  TrainingModule,
} from "@/types/supabase";

export const dynamic = "force-dynamic";

type SelectedAnswers = Record<string, string>;

type EmployeeTrainingActionPayload = {
  action?: unknown;
  module_id?: unknown;
  answers?: unknown;
};

type TrainingStatus = {
  module_id: string;
  assignment_id: string | null;
  status:
    | "not_started"
    | "in_progress"
    | "lesson_complete_quiz_required"
    | "completed"
    | "failed_retake_available"
    | "failed";
  progress_percent: number;
  lesson_completed: boolean;
  has_quiz: boolean;
  latest_score: number | null;
  latest_passed: boolean | null;
  attempt_count: number;
  can_retake: boolean;
  action_label:
    | "Start Training"
    | "Continue Training"
    | "Start Quiz"
    | "Retake Quiz"
    | "Review Training";
};

function getBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) return null;

  return authHeader.slice("Bearer ".length).trim();
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function logServerError(message: string, error: unknown) {
  console.error(`[employee-training] ${message}`, error);
}

function getEmployeeName(employee: Profile) {
  return (
    employee.preferred_name?.trim() ||
    employee.full_name?.trim() ||
    [employee.first_name, employee.last_name].filter(Boolean).join(" ").trim() ||
    employee.email
  );
}

function formatLocationName(location: Location | null) {
  if (!location) return "Not assigned";

  return `Store ${location.store_number} - ${location.name}`;
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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

async function requireEmployeeProfile(request: Request) {
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

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError) {
    logServerError("Employee profile lookup failed", profileError);
    return {
      response: jsonError("Unable to load your profile.", 500),
      supabase: null,
      profile: null,
    };
  }

  if (!profile || !profile.is_active) {
    return {
      response: jsonError("You do not have access to employee training.", 403),
      supabase: null,
      profile: null,
    };
  }

  return { response: null, supabase, profile };
}

async function fetchCompany(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  companyId: string
) {
  const { data, error } = await supabase
    .from("companies")
    .select(
      "id,name,primary_color,secondary_color,accent_color,logo_url,favicon_url"
    )
    .eq("id", companyId)
    .maybeSingle();

  if (error) logServerError("Company lookup failed", error);

  return data ?? null;
}

function fetchPublishedModules(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  companyId: string
) {
  return supabase
    .from("training_modules")
    .select("*")
    .eq("company_id", companyId)
    .eq("status", "published")
    .eq("training_audience", "all")
    .order("updated_at", { ascending: false });
}

function fetchPublishedModule(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  moduleId: string,
  companyId: string
) {
  return supabase
    .from("training_modules")
    .select("*")
    .eq("id", moduleId)
    .eq("company_id", companyId)
    .eq("status", "published")
    .eq("training_audience", "all")
    .maybeSingle();
}

function fetchQuestions(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  moduleId: string,
  companyId: string
) {
  return supabase
    .from("quiz_questions")
    .select("*")
    .eq("module_id", moduleId)
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("question_order", { ascending: true });
}

async function fetchAssignments(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  employeeId: string,
  moduleIds: string[]
) {
  if (moduleIds.length === 0) return [] as TrainingAssignment[];

  const { data, error } = await supabase
    .from("training_assignments")
    .select("*")
    .eq("employee_id", employeeId)
    .in("module_id", moduleIds);

  if (error) {
    logServerError("Training assignments lookup failed", error);
    return [] as TrainingAssignment[];
  }

  return data ?? [];
}

async function fetchAttempts(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  employeeId: string,
  companyId: string,
  moduleIds: string[]
) {
  if (moduleIds.length === 0) return [] as QuizAttempt[];

  const { data, error } = await supabase
    .from("quiz_attempts")
    .select("*")
    .eq("employee_id", employeeId)
    .eq("company_id", companyId)
    .in("module_id", moduleIds)
    .order("attempt_number", { ascending: false });

  if (error) {
    logServerError("Quiz attempts lookup failed", error);
    return [] as QuizAttempt[];
  }

  return data ?? [];
}

function getLatestAttempt(attempts: QuizAttempt[]) {
  return attempts[0] ?? null;
}

function getCanRetake(module: TrainingModule, attempts: QuizAttempt[]) {
  const latestAttempt = getLatestAttempt(attempts);

  if (!latestAttempt || latestAttempt.passed) return false;
  if (!module.allow_retake) return false;
  if (module.max_attempts === null) return true;

  return attempts.length < module.max_attempts;
}

function buildTrainingStatus(
  module: TrainingModule,
  assignment: TrainingAssignment | undefined,
  questions: QuizQuestionRow[],
  attempts: QuizAttempt[]
): TrainingStatus {
  const hasQuiz = questions.length > 0;
  const latestAttempt = getLatestAttempt(attempts);
  const canRetake = getCanRetake(module, attempts);
  const assignmentStatus = assignment?.status ?? "not_started";
  const progressPercent = assignment?.progress_percent ?? 0;
  const lessonCompleted =
    progressPercent >= 100 &&
    (assignmentStatus === "in_progress" ||
      assignmentStatus === "completed" ||
      assignmentStatus === "failed");

  if (assignmentStatus === "completed") {
    return {
      module_id: module.id,
      assignment_id: assignment?.id ?? null,
      status: "completed",
      progress_percent: 100,
      lesson_completed: true,
      has_quiz: hasQuiz,
      latest_score: assignment?.latest_score ?? latestAttempt?.score ?? null,
      latest_passed: assignment?.passed ?? latestAttempt?.passed ?? true,
      attempt_count: attempts.length,
      can_retake: false,
      action_label: "Review Training",
    };
  }

  if (assignmentStatus === "failed") {
    return {
      module_id: module.id,
      assignment_id: assignment?.id ?? null,
      status: canRetake ? "failed_retake_available" : "failed",
      progress_percent: progressPercent,
      lesson_completed: progressPercent >= 100,
      has_quiz: hasQuiz,
      latest_score: assignment?.latest_score ?? latestAttempt?.score ?? null,
      latest_passed: false,
      attempt_count: attempts.length,
      can_retake: canRetake,
      action_label: canRetake ? "Retake Quiz" : "Review Training",
    };
  }

  if (lessonCompleted && hasQuiz) {
    return {
      module_id: module.id,
      assignment_id: assignment?.id ?? null,
      status: "lesson_complete_quiz_required",
      progress_percent: 100,
      lesson_completed: true,
      has_quiz: true,
      latest_score: assignment?.latest_score ?? null,
      latest_passed: assignment?.passed ?? null,
      attempt_count: attempts.length,
      can_retake: false,
      action_label: "Start Quiz",
    };
  }

  if (assignmentStatus === "in_progress") {
    return {
      module_id: module.id,
      assignment_id: assignment?.id ?? null,
      status: "in_progress",
      progress_percent: Math.max(1, progressPercent),
      lesson_completed: false,
      has_quiz: hasQuiz,
      latest_score: assignment?.latest_score ?? null,
      latest_passed: assignment?.passed ?? null,
      attempt_count: attempts.length,
      can_retake: false,
      action_label: "Continue Training",
    };
  }

  return {
    module_id: module.id,
    assignment_id: assignment?.id ?? null,
    status: "not_started",
    progress_percent: progressPercent,
    lesson_completed: false,
    has_quiz: hasQuiz,
    latest_score: assignment?.latest_score ?? null,
    latest_passed: assignment?.passed ?? null,
    attempt_count: attempts.length,
    can_retake: false,
    action_label: "Start Training",
  };
}

async function fetchStatusMap(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  employeeId: string,
  companyId: string,
  modules: TrainingModule[]
) {
  const moduleIds = modules.map((module) => module.id);
  const [assignments, attempts, questionsResult] = await Promise.all([
    fetchAssignments(supabase, employeeId, moduleIds),
    fetchAttempts(supabase, employeeId, companyId, moduleIds),
    moduleIds.length > 0
      ? supabase
          .from("quiz_questions")
          .select("*")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .in("module_id", moduleIds)
      : Promise.resolve({ data: [] as QuizQuestionRow[], error: null }),
  ]);

  if (questionsResult.error) {
    logServerError("Quiz questions status lookup failed", questionsResult.error);
  }

  const assignmentByModuleId = new Map(
    assignments.map((assignment) => [assignment.module_id, assignment])
  );
  const attemptsByModuleId = new Map<string, QuizAttempt[]>();
  const questionsByModuleId = new Map<string, QuizQuestionRow[]>();

  for (const attempt of attempts) {
    attemptsByModuleId.set(attempt.module_id, [
      ...(attemptsByModuleId.get(attempt.module_id) ?? []),
      attempt,
    ]);
  }

  for (const question of questionsResult.data ?? []) {
    questionsByModuleId.set(question.module_id, [
      ...(questionsByModuleId.get(question.module_id) ?? []),
      question,
    ]);
  }

  return Object.fromEntries(
    modules.map((module) => [
      module.id,
      buildTrainingStatus(
        module,
        assignmentByModuleId.get(module.id),
        questionsByModuleId.get(module.id) ?? [],
        attemptsByModuleId.get(module.id) ?? []
      ),
    ])
  );
}

async function ensureStartedAssignment(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  employeeId: string,
  moduleId: string
) {
  const now = new Date().toISOString();
  const { data: existingAssignment, error: lookupError } = await supabase
    .from("training_assignments")
    .select("*")
    .eq("employee_id", employeeId)
    .eq("module_id", moduleId)
    .maybeSingle();

  if (lookupError) {
    logServerError("Training assignment lookup before start failed", lookupError);
    throw new Error("Unable to start training assignment.");
  }

  if (!existingAssignment) {
    const { data: assignment, error: insertError } = await supabase
      .from("training_assignments")
      .insert({
        employee_id: employeeId,
        module_id: moduleId,
        status: "in_progress",
        progress_percent: 1,
        started_at: now,
        completed_at: null,
        latest_score: null,
        passed: null,
        assigned_by: null,
      })
      .select("*")
      .single();

    if (insertError || !assignment) {
      logServerError("Training assignment start insert failed", insertError);
      throw new Error("Unable to start training assignment.");
    }

    return assignment;
  }

  if (existingAssignment.status === "not_started") {
    const { data: assignment, error: updateError } = await supabase
      .from("training_assignments")
      .update({
        status: "in_progress",
        progress_percent: Math.max(1, existingAssignment.progress_percent),
        started_at: existingAssignment.started_at ?? now,
      })
      .eq("id", existingAssignment.id)
      .select("*")
      .single();

    if (updateError || !assignment) {
      logServerError("Training assignment start update failed", updateError);
      throw new Error("Unable to start training assignment.");
    }

    return assignment;
  }

  return existingAssignment;
}

async function completeAssignmentWithoutQuiz(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  assignmentId: string
) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("training_assignments")
    .update({
      status: "completed",
      progress_percent: 100,
      completed_at: now,
      passed: true,
    })
    .eq("id", assignmentId);

  if (error) {
    logServerError("Training assignment completion failed", error);
    throw new Error("Unable to complete training assignment.");
  }

  return now;
}

async function claimCompletionEmailNotification(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  assignmentId: string,
  employeeId: string
) {
  const { data, error } = await supabase
    .from("training_assignments")
    .update({ completion_email_sent_at: new Date().toISOString() })
    .eq("id", assignmentId)
    .eq("employee_id", employeeId)
    .eq("status", "completed")
    .eq("passed", true)
    .is("completion_email_sent_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    logServerError("Training completion email claim failed", error);
    return false;
  }

  return Boolean(data);
}

async function sendTrainingCompletionNotification({
  supabase,
  assignmentId,
  employeeId,
  module,
  latestScore,
  completedAt,
}: {
  supabase: ReturnType<typeof createAdminSupabaseClient>;
  assignmentId: string;
  employeeId: string;
  module: TrainingModule;
  latestScore: number | null;
  completedAt: string | null;
}) {
  try {
    if (!isPingramEmailConfigured()) {
      console.warn(
        "[employee-training] Training completion email skipped; Pingram is not configured."
      );
      return;
    }

    const claimed = await claimCompletionEmailNotification(
      supabase,
      assignmentId,
      employeeId
    );

    if (!claimed) return;

    const { data: employee, error: employeeError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", employeeId)
      .maybeSingle();

    if (employeeError || !employee) {
      logServerError("Completion email employee lookup failed", employeeError);
      return;
    }

    const [
      companyResult,
      locationResult,
      locationManagersResult,
      companyAdminsResult,
    ] =
      await Promise.all([
        supabase
          .from("companies")
          .select("name,logo_url")
          .eq("id", employee.company_id)
          .maybeSingle(),
        employee.location_id
          ? supabase
              .from("locations")
              .select("*")
              .eq("id", employee.location_id)
              .eq("company_id", employee.company_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        employee.location_id
          ? supabase
              .from("profiles")
              .select("email")
              .eq("company_id", employee.company_id)
              .eq("location_id", employee.location_id)
              .eq("is_active", true)
              .in("role", ["manager", "admin"])
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from("profiles")
          .select("email")
          .eq("company_id", employee.company_id)
          .eq("role", "admin")
          .eq("is_active", true),
      ]);

    if (companyResult.error) {
      logServerError("Completion email company lookup failed", companyResult.error);
    }

    if (locationResult.error) {
      logServerError("Completion email location lookup failed", locationResult.error);
    }

    if (locationManagersResult.error) {
      logServerError(
        "Completion email location manager lookup failed",
        locationManagersResult.error
      );
    }

    if (companyAdminsResult.error) {
      logServerError(
        "Completion email company admin lookup failed",
        companyAdminsResult.error
      );
    }

    const recipients = [
      ...(locationManagersResult.data ?? []).map((recipient) => recipient.email),
      ...(companyAdminsResult.data ?? []).map((recipient) => recipient.email),
    ];

    const result = await sendTrainingCompletionEmail({
      recipients,
      company: companyResult.data ?? null,
      employeeName: getEmployeeName(employee),
      employeeNumber: employee.employee_number,
      locationName: formatLocationName(locationResult.data),
      trainingTitle: module.title,
      latestScore,
      completedAt,
      trainingUrl: `/employee/training/${module.id}`,
    });

    if (!result.sent && !result.skipped) {
      logServerError("Training completion notification email failed", result);
    }
  } catch (error) {
    logServerError("Training completion notification email failed", error);
  }
}

async function markLessonReadyForQuiz(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  assignmentId: string
) {
  const { error } = await supabase
    .from("training_assignments")
    .update({
      status: "in_progress",
      progress_percent: 100,
    })
    .eq("id", assignmentId);

  if (error) {
    logServerError("Training assignment lesson completion failed", error);
    throw new Error("Unable to update training assignment.");
  }
}

function normalizeAnswers(value: unknown): SelectedAnswers {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const answers: SelectedAnswers = {};

  for (const [questionId, selectedAnswer] of Object.entries(value)) {
    answers[questionId] = readString(selectedAnswer).toUpperCase();
  }

  return answers;
}

async function submitQuizAttempt({
  supabase,
  employeeId,
  companyId,
  module,
  assignment,
  questions,
  selectedAnswers,
}: {
  supabase: ReturnType<typeof createAdminSupabaseClient>;
  employeeId: string;
  companyId: string;
  module: TrainingModule;
  assignment: TrainingAssignment;
  questions: QuizQuestionRow[];
  selectedAnswers: SelectedAnswers;
}) {
  const attempts = await fetchAttempts(supabase, employeeId, companyId, [module.id]);
  const latestAttempt = getLatestAttempt(attempts);

  if (latestAttempt?.passed || assignment.status === "completed") {
    return {
      response: jsonError("You have already passed this quiz.", 409),
      result: null,
    };
  }

  if (!module.allow_retake && attempts.length > 0) {
    return {
      response: jsonError("Retakes are not allowed for this training.", 403),
      result: null,
    };
  }

  if (module.max_attempts !== null && attempts.length >= module.max_attempts) {
    return {
      response: jsonError("Maximum quiz attempts reached.", 403),
      result: null,
    };
  }

  const scoredAnswers = questions.map((question) => {
    const selectedAnswer = selectedAnswers[question.id] || "";
    const correctAnswer = question.correct_answer.toUpperCase();

    return {
      question,
      selectedAnswer,
      correctAnswer,
      isCorrect: selectedAnswer === correctAnswer,
    };
  });
  const correctCount = scoredAnswers.filter((answer) => answer.isCorrect).length;
  const score =
    questions.length === 0 ? 0 : Math.round((correctCount / questions.length) * 100);
  const passed = score >= module.passing_score;
  const now = new Date().toISOString();
  const attemptNumber = attempts.length + 1;

  const { data: attempt, error: attemptError } = await supabase
    .from("quiz_attempts")
    .insert({
      assignment_id: assignment.id,
      employee_id: employeeId,
      module_id: module.id,
      attempt_number: attemptNumber,
      total_questions: questions.length,
      correct_answers: correctCount,
      score,
      passed,
      duration_seconds: null,
      started_at: assignment.started_at ?? now,
      submitted_at: now,
      company_id: companyId,
    })
    .select("*")
    .single();

  if (attemptError || !attempt) {
    logServerError("Quiz attempt insert failed", attemptError);
    throw new Error("Unable to save quiz attempt.");
  }

  const { error: answersError } = await supabase
    .from("quiz_attempt_answers")
    .insert(
      scoredAnswers.map((answer) => ({
        attempt_id: attempt.id,
        question_id: answer.question.id,
        selected_answer: answer.selectedAnswer,
        correct_answer: answer.correctAnswer,
        is_correct: answer.isCorrect,
      }))
    );

  if (answersError) {
    logServerError("Quiz attempt answers insert failed", answersError);
    throw new Error("Unable to save quiz answers.");
  }

  const { error: assignmentError } = await supabase
    .from("training_assignments")
    .update({
      status: passed ? "completed" : "failed",
      progress_percent: 100,
      latest_score: score,
      passed,
      completed_at: passed ? now : null,
    })
    .eq("id", assignment.id)
    .eq("employee_id", employeeId);

  if (assignmentError) {
    logServerError("Training assignment quiz update failed", assignmentError);
    throw new Error("Unable to update training assignment.");
  }

  if (passed) {
    await sendTrainingCompletionNotification({
      supabase,
      assignmentId: assignment.id,
      employeeId,
      module,
      latestScore: score,
      completedAt: now,
    });
  }

  return {
    response: null,
    result: {
      score,
      passed,
      correct_answers: correctCount,
      total_questions: questions.length,
      attempt_number: attemptNumber,
      can_retake: passed ? false : getCanRetake(module, [...attempts, attempt]),
    },
  };
}

export async function GET(request: Request) {
  const { response, supabase, profile } = await requireEmployeeProfile(request);

  if (response) return response;

  const moduleId = new URL(request.url).searchParams.get("moduleId");
  const company = await fetchCompany(supabase, profile.company_id);

  if (moduleId) {
    const { data: module, error: moduleError } = await fetchPublishedModule(
      supabase,
      moduleId,
      profile.company_id
    );

    if (moduleError) {
      logServerError("Training module lookup failed", moduleError);
      return jsonError("Unable to load training.", 500);
    }

    if (!module) {
      return jsonError("Training module not found.", 404);
    }

    let assignment: TrainingAssignment;

    try {
      assignment = await ensureStartedAssignment(supabase, profile.id, module.id);
    } catch (error) {
      return jsonError(
        error instanceof Error ? error.message : "Unable to start training.",
        500
      );
    }

    const [slidesResult, questionsResult, attempts] = await Promise.all([
      supabase
        .from("training_slides")
        .select("*")
        .eq("module_id", module.id)
        .eq("company_id", profile.company_id)
        .eq("is_active", true)
        .order("slide_order", { ascending: true }),
      fetchQuestions(supabase, module.id, profile.company_id),
      fetchAttempts(supabase, profile.id, profile.company_id, [module.id]),
    ]);

    if (slidesResult.error) {
      logServerError("Training slides lookup failed", slidesResult.error);
      return jsonError("Unable to load training slides.", 500);
    }

    if (questionsResult.error) {
      logServerError("Quiz questions lookup failed", questionsResult.error);
      return jsonError("Unable to load quiz questions.", 500);
    }

    return NextResponse.json({
      profile,
      company,
      module,
      assignment,
      slides: slidesResult.data ?? [],
      quiz_questions: questionsResult.data ?? [],
      status: buildTrainingStatus(
        module,
        assignment,
        questionsResult.data ?? [],
        attempts
      ),
    });
  }

  const { data: modules, error } = await fetchPublishedModules(
    supabase,
    profile.company_id
  );

  if (error) {
    logServerError("Assigned trainings lookup failed", error);
    return jsonError("Unable to load assigned trainings.", 500);
  }

  const statuses = await fetchStatusMap(
    supabase,
    profile.id,
    profile.company_id,
    modules ?? []
  );

  return NextResponse.json({
    profile,
    company,
    modules: modules ?? [],
    statuses,
    assignmentMode: "training_assignments",
    positionSpecificSupported: false,
  });
}

export async function POST(request: Request) {
  const { response, supabase, profile } = await requireEmployeeProfile(request);

  if (response) return response;

  let payload: EmployeeTrainingActionPayload;

  try {
    payload = (await request.json()) as EmployeeTrainingActionPayload;
  } catch (error) {
    logServerError("Employee training action payload parsing failed", error);
    return jsonError("Unable to update training progress.", 400);
  }

  const action = readString(payload.action);
  const moduleId = readString(payload.module_id);

  if (!moduleId) {
    return jsonError("Choose a training module.", 400);
  }

  const { data: module, error: moduleError } = await fetchPublishedModule(
    supabase,
    moduleId,
    profile.company_id
  );

  if (moduleError) {
    logServerError("Training module action lookup failed", moduleError);
    return jsonError("Unable to update training progress.", 500);
  }

  if (!module) {
    return jsonError("Training module not found.", 404);
  }

  let assignment: TrainingAssignment;

  try {
    assignment = await ensureStartedAssignment(supabase, profile.id, module.id);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Unable to update training.",
      500
    );
  }

  if (action === "complete_lesson") {
    const questionsResult = await fetchQuestions(supabase, module.id, profile.company_id);

    if (questionsResult.error) {
      logServerError("Quiz question lookup after lesson failed", questionsResult.error);
      return jsonError("Unable to load quiz questions.", 500);
    }

    try {
      if ((questionsResult.data?.length ?? 0) > 0) {
        await markLessonReadyForQuiz(supabase, assignment.id);
      } else {
        const completedAt = await completeAssignmentWithoutQuiz(
          supabase,
          assignment.id
        );

        await sendTrainingCompletionNotification({
          supabase,
          assignmentId: assignment.id,
          employeeId: profile.id,
          module,
          latestScore: null,
          completedAt,
        });
      }
    } catch (error) {
      return jsonError(
        error instanceof Error ? error.message : "Unable to complete lesson.",
        500
      );
    }

    const assignments = await fetchAssignments(supabase, profile.id, [module.id]);
    const attempts = await fetchAttempts(supabase, profile.id, profile.company_id, [
      module.id,
    ]);

    return NextResponse.json({
      success: true,
      status: buildTrainingStatus(
        module,
        assignments[0],
        questionsResult.data ?? [],
        attempts
      ),
      has_quiz: (questionsResult.data?.length ?? 0) > 0,
    });
  }

  if (action === "submit_quiz") {
    const questionsResult = await fetchQuestions(supabase, module.id, profile.company_id);

    if (questionsResult.error) {
      logServerError("Quiz questions submit lookup failed", questionsResult.error);
      return jsonError("Unable to submit quiz.", 500);
    }

    const questions = questionsResult.data ?? [];

    if (questions.length === 0) {
      return jsonError("This training does not have a quiz.", 400);
    }

    const selectedAnswers = normalizeAnswers(payload.answers);
    const missingAnswer = questions.some((question) => !selectedAnswers[question.id]);

    if (missingAnswer) {
      return jsonError("Answer every question before submitting.", 400);
    }

    try {
      const savedAttempt = await submitQuizAttempt({
        supabase,
        employeeId: profile.id,
        companyId: profile.company_id,
        module,
        assignment,
        questions,
        selectedAnswers,
      });

      if (savedAttempt.response) return savedAttempt.response;

      const assignments = await fetchAssignments(supabase, profile.id, [module.id]);
      const attempts = await fetchAttempts(supabase, profile.id, profile.company_id, [
        module.id,
      ]);

      return NextResponse.json({
        success: true,
        result: savedAttempt.result,
        status: buildTrainingStatus(module, assignments[0], questions, attempts),
      });
    } catch (error) {
      return jsonError(
        error instanceof Error ? error.message : "Unable to submit quiz.",
        500
      );
    }
  }

  return jsonError("Choose a valid training action.", 400);
}
