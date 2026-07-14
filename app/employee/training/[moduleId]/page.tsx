"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import EmployeeLayout from "@/components/layout/EmployeeLayout";
import TrainingViewer from "@/components/training/LessonViewer";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { formatCategoryLabel } from "@/lib/training/formatCategoryLabel";
import type {
  Company,
  Profile,
  QuizQuestionRow,
  TrainingModule,
  TrainingSlide,
} from "@/types/supabase";

type EmployeeCompany = Pick<
  Company,
  | "id"
  | "name"
  | "primary_color"
  | "secondary_color"
  | "accent_color"
  | "logo_url"
  | "favicon_url"
>;

type TrainingStatus = {
  module_id: string;
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

type EmployeeTrainingDetailResponse = {
  profile: Profile;
  company: EmployeeCompany | null;
  module: TrainingModule;
  assignment: unknown;
  slides: TrainingSlide[];
  quiz_questions: QuizQuestionRow[];
  status: TrainingStatus;
};

type QuizResult = {
  score: number;
  passed: boolean;
  correct_answers: number;
  total_questions: number;
  attempt_number: number;
  can_retake: boolean;
};

type TrainingActionResponse = {
  success: boolean;
  has_quiz?: boolean;
  result?: QuizResult;
  status?: TrainingStatus;
};

type PageStatus = "loading" | "success" | "error";
type ViewMode = "lesson" | "quiz" | "result";

const answerKeys = ["A", "B", "C", "D"] as const;

function getReadableErrorMessage(data: unknown, fallback: string) {
  if (!data || typeof data !== "object") return fallback;

  const error = (data as { error?: unknown }).error;
  return typeof error === "string" ? error : fallback;
}

function getAnswerText(question: QuizQuestionRow, answerKey: string) {
  if (answerKey === "A") return question.answer_a;
  if (answerKey === "B") return question.answer_b;
  if (answerKey === "C") return question.answer_c;
  if (answerKey === "D") return question.answer_d;

  return null;
}

function getAvailableAnswerKeys(question: QuizQuestionRow) {
  if (question.question_type === "true_false") return ["A", "B"];

  return answerKeys.filter((answerKey) => getAnswerText(question, answerKey));
}

function getStatusCopy(status: TrainingStatus | null, hasQuestions: boolean) {
  if (status?.status === "completed") return "Completed";
  if (status?.status === "failed_retake_available") return "Retake available";
  if (status?.status === "failed") return "Attempt limit reached";
  if (status?.lesson_completed && hasQuestions) return "Quiz required";
  if (status?.lesson_completed) return "Lesson complete";
  if ((status?.progress_percent ?? 0) > 0) return "In progress";

  return "Not started";
}

export default function EmployeeTrainingPage() {
  const params = useParams<{ moduleId: string }>();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [company, setCompany] = useState<EmployeeCompany | null>(null);
  const [trainingModule, setTrainingModule] = useState<TrainingModule | null>(
    null
  );
  const [slides, setSlides] = useState<TrainingSlide[]>([]);
  const [questions, setQuestions] = useState<QuizQuestionRow[]>([]);
  const [trainingStatus, setTrainingStatus] = useState<TrainingStatus | null>(
    null
  );
  const [viewMode, setViewMode] = useState<ViewMode>("lesson");
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>(
    {}
  );
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null);
  const [quizStartedAt, setQuizStartedAt] = useState<string | null>(null);
  const [pageStatus, setPageStatus] = useState<PageStatus>("loading");
  const [pageError, setPageError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadTraining() {
      const supabase = createBrowserSupabaseClient();

      if (!supabase) {
        if (!isMounted) return;

        setPageStatus("error");
        setPageError("Supabase environment variables are not configured.");
        return;
      }

      const { data, error } = await supabase.auth.getSession();

      if (!isMounted) return;

      if (error || !data.session?.access_token) {
        router.replace(
          `/login?next=${encodeURIComponent(`/employee/training/${params.moduleId}`)}`
        );
        return;
      }

      const response = await fetch(
        `/api/employee/training?moduleId=${encodeURIComponent(params.moduleId)}`,
        {
          headers: {
            Authorization: `Bearer ${data.session.access_token}`,
          },
        }
      );
      const responseData = (await response.json().catch(() => null)) as
        | EmployeeTrainingDetailResponse
        | { error?: string }
        | null;

      if (!isMounted) return;

      if (!response.ok) {
        setPageStatus("error");
        setPageError(
          getReadableErrorMessage(responseData, "Unable to load this training.")
        );
        return;
      }

      const trainingData = responseData as EmployeeTrainingDetailResponse;

      setProfile(trainingData.profile);
      setCompany(trainingData.company);
      setTrainingModule(trainingData.module);
      setSlides(trainingData.slides);
      setQuestions(trainingData.quiz_questions);
      setTrainingStatus(trainingData.status);
      const startsInQuiz =
        trainingData.status.status === "lesson_complete_quiz_required" ||
        trainingData.status.status === "failed_retake_available";
      setViewMode(startsInQuiz ? "quiz" : "lesson");
      setQuizStartedAt(startsInQuiz ? new Date().toISOString() : null);
      setPageStatus("success");
    }

    loadTraining();

    return () => {
      isMounted = false;
    };
  }, [params.moduleId, router]);

  const viewerSlides = useMemo(
    () =>
      slides.map((slide, index) => ({
        id: index + 1,
        title: slide.title,
        body: slide.body || "",
        slide_type: slide.slide_type,
        config_json: slide.config_json ?? {},
        media: slide.image_url
          ? {
              type: "image" as const,
              url: slide.image_url,
              alt: slide.title ? `${slide.title} image` : "Training slide image",
            }
          : undefined,
      })),
    [slides]
  );

  const canSubmitQuiz =
    questions.length > 0 &&
    questions.every((question) => Boolean(selectedAnswers[question.id]));
  const canRetakeQuiz = trainingStatus?.can_retake ?? false;

  async function getAuthHeaders() {
    const supabase = createBrowserSupabaseClient();

    if (!supabase) {
      throw new Error("Supabase environment variables are not configured.");
    }

    const { data, error } = await supabase.auth.getSession();

    if (error || !data.session?.access_token) {
      throw new Error(error?.message || "Sign in before updating training.");
    }

    return {
      Authorization: `Bearer ${data.session.access_token}`,
      "Content-Type": "application/json",
    };
  }

  async function completeLesson() {
    if (!trainingModule) return;

    setIsSubmitting(true);
    setPageError("");
    setActionMessage("");

    try {
      const headers = await getAuthHeaders();
      const response = await fetch("/api/employee/training", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "complete_lesson",
          module_id: trainingModule.id,
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | TrainingActionResponse
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(getReadableErrorMessage(data, "Unable to complete lesson."));
      }

      const actionData = data as TrainingActionResponse;

      if (actionData.status) setTrainingStatus(actionData.status);
      if (questions.length > 0 || actionData.has_quiz) {
        setViewMode("quiz");
        setQuizStartedAt(new Date().toISOString());
        setActionMessage("Lesson complete. Start the quiz when ready.");
      } else {
        setViewMode("result");
        setQuizResult({
          score: 100,
          passed: true,
          correct_answers: 0,
          total_questions: 0,
          attempt_number: 0,
          can_retake: false,
        });
        setActionMessage("Lesson complete.");
      }
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Unable to complete lesson.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitQuiz() {
    if (!trainingModule) return;

    setIsSubmitting(true);
    setPageError("");
    setActionMessage("");

    try {
      const headers = await getAuthHeaders();
      const response = await fetch("/api/employee/training", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "submit_quiz",
          module_id: trainingModule.id,
          answers: selectedAnswers,
          quiz_started_at: quizStartedAt,
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | TrainingActionResponse
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(getReadableErrorMessage(data, "Unable to submit quiz."));
      }

      const actionData = data as TrainingActionResponse;

      if (actionData.status) setTrainingStatus(actionData.status);
      if (actionData.result) setQuizResult(actionData.result);
      setViewMode("result");
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Unable to submit quiz.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function resetQuizForRetake() {
    setSelectedAnswers({});
    setQuizResult(null);
    setViewMode("quiz");
    setQuizStartedAt(new Date().toISOString());
    setActionMessage("Retake the quiz when ready.");
  }

  return (
    <EmployeeLayout
      company={company}
      profile={profile}
      title={trainingModule?.title || "Training"}
      description={getStatusCopy(trainingStatus, questions.length > 0)}
    >
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <Link
          href="/employee/dashboard"
          className="text-sm font-semibold text-blue-700 hover:text-blue-800"
        >
          Back to Trainings
        </Link>

        {trainingModule && (
          <p className="text-sm font-medium text-slate-500">
            {formatCategoryLabel(trainingModule.category)} · Passing score:{" "}
            {trainingModule.passing_score}%
          </p>
        )}
      </div>

      {actionMessage && (
        <div className="mb-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
          {actionMessage}
        </div>
      )}

      {pageStatus === "loading" ? (
        <section className="rounded-xl bg-white p-8 shadow-sm">
          <p className="font-semibold text-slate-900">Loading training</p>
          <p className="mt-2 text-sm text-slate-500">
            Fetching lesson slides from Supabase.
          </p>
        </section>
      ) : pageStatus === "error" || pageError ? (
        <section className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm font-medium text-red-700">
          {pageError}
        </section>
      ) : viewMode === "quiz" ? (
        <section className="rounded-xl bg-white p-6 shadow-sm">
          <div className="mb-6 border-b border-slate-200 pb-5">
            <p className="text-sm font-semibold text-blue-600">Quiz</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-900">
              {trainingModule?.title}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Answer every question. You need {trainingModule?.passing_score}% to pass.
            </p>
          </div>

          <div className="space-y-6">
            {questions.map((question, questionIndex) => (
              <fieldset
                key={question.id}
                className="rounded-lg border border-slate-200 p-4"
              >
                <legend className="px-1 text-sm font-bold text-slate-900">
                  {questionIndex + 1}. {question.question_text}
                </legend>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {getAvailableAnswerKeys(question).map((answerKey) => (
                    <label
                      key={answerKey}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 text-sm transition ${
                        selectedAnswers[question.id] === answerKey
                          ? "border-blue-600 bg-blue-50 text-blue-700"
                          : "border-slate-200 text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name={question.id}
                        value={answerKey}
                        checked={selectedAnswers[question.id] === answerKey}
                        onChange={() =>
                          setSelectedAnswers((currentAnswers) => ({
                            ...currentAnswers,
                            [question.id]: answerKey,
                          }))
                        }
                        className="mt-1"
                      />
                      <span>
                        <span className="font-semibold">{answerKey}.</span>{" "}
                        {getAnswerText(question, answerKey)}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-slate-200 pt-5">
            <button
              type="button"
              onClick={() => setViewMode("lesson")}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Review Lesson
            </button>
            <button
              type="button"
              onClick={submitQuiz}
              disabled={!canSubmitQuiz || isSubmitting}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isSubmitting ? "Submitting..." : "Submit Quiz"}
            </button>
          </div>
        </section>
      ) : viewMode === "result" && quizResult ? (
        <section className="rounded-xl bg-white p-8 text-center shadow-sm">
          <p
            className={`text-sm font-bold uppercase tracking-wide ${
              quizResult.passed ? "text-green-700" : "text-red-700"
            }`}
          >
            {quizResult.passed ? "Passed" : "Not Passed"}
          </p>
          <h2 className="mt-3 text-3xl font-bold text-slate-900">
            Score: {quizResult.score}%
          </h2>
          {quizResult.total_questions > 0 && (
            <p className="mt-2 text-sm text-slate-500">
              {quizResult.correct_answers} of {quizResult.total_questions} answers
              correct. Attempt {quizResult.attempt_number}.
            </p>
          )}
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/employee/dashboard"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Back to Trainings
            </Link>
            {!quizResult.passed && canRetakeQuiz && (
              <button
                type="button"
                onClick={resetQuizForRetake}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Retake Quiz
              </button>
            )}
          </div>
        </section>
      ) : (
        <TrainingViewer
          title={trainingModule?.title || "Training"}
          slides={viewerSlides}
          onComplete={completeLesson}
          finalActionLabel={questions.length > 0 ? "Start Quiz" : "Lesson Complete"}
          completeLabel={questions.length > 0 ? "Quiz Ready" : "Lesson Complete"}
        />
      )}
    </EmployeeLayout>
  );
}
