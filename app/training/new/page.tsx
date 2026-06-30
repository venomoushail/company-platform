"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import SlideBuilder, { Slide } from "@/components/training/LessonBuilder";
import { SlidePreviewCard } from "@/components/training/RenderedSlide";
import QuizBuilder, { QuizQuestion } from "@/components/training/QuizBuilder";
import QuizViewer from "@/components/training/QuizViewer";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type {
  Position,
  QuizQuestionRow,
  TrainingModule,
  TrainingSlide,
} from "@/types/supabase";

type TrainingDetailResponse = {
  module: TrainingModule;
  slides: TrainingSlide[];
  quiz_questions: QuizQuestionRow[];
  positions: Position[];
  selected_position_ids: string[];
};

type TrainingAudienceMetadataResponse = {
  positions: Position[];
};

type FormState = {
  description: string;
  category: string;
  estimatedMinutes: string;
  trainingAudience: string;
  passingScore: string;
  allowRetake: boolean;
  maxAttempts: string;
  renewalPeriodDays: string;
  daysAllowed: string;
};

type SaveStatus = "idle" | "loading" | "success" | "error";

function getReadableErrorMessage(data: unknown, fallback: string) {
  if (!data || typeof data !== "object") return fallback;

  const error = (data as { error?: unknown }).error;
  return typeof error === "string" ? error : fallback;
}

function mapCorrectAnswerToIndex(correctAnswer: string | null | undefined) {
  const answer = (correctAnswer || "A").toUpperCase();
  const index = ["A", "B", "C", "D"].indexOf(answer);
  return index >= 0 ? index : 0;
}

function mapQuestionToCorrectAnswer(index: number) {
  return ["A", "B", "C", "D"][index] ?? "A";
}

function normalizeStatus(status: "draft" | "published") {
  return status;
}

export default function NewTrainingPage() {
  const [moduleId, setModuleId] = useState<string | null>(null);
  const [trainingTitle, setTrainingTitle] = useState("");
  const [formState, setFormState] = useState<FormState>({
    description: "",
    category: "",
    estimatedMinutes: "",
    trainingAudience: "all",
    passingScore: "80",
    allowRetake: true,
    maxAttempts: "",
    renewalPeriodDays: "",
    daysAllowed: "",
  });
  const [loadStatus, setLoadStatus] = useState<SaveStatus>("idle");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [formMessage, setFormMessage] = useState("");
  const [audienceError, setAudienceError] = useState("");
  const [positions, setPositions] = useState<Position[]>([]);
  const [selectedPositionIds, setSelectedPositionIds] = useState<string[]>([]);
  const [positionsStatus, setPositionsStatus] = useState<SaveStatus>("idle");

  const [slides, setSlides] = useState<Slide[]>([
    {
      id: 1,
      title: "",
      body: "",
      isComplete: false,
    },
  ]);

  const [selectedSlideId, setSelectedSlideId] = useState(1);

  const [questions, setQuestions] = useState<QuizQuestion[]>([
  {
    id: 1,
    question: "",
    answers: ["", "", "", ""],
    correctAnswerIndex: 0,
    isComplete: false,
  },
]);

const [selectedQuestionId, setSelectedQuestionId] = useState(1);

const [activePreview, setActivePreview] = useState<"lesson" | "quiz">("lesson");

const selectedQuestion =
  questions.find((question) => question.id === selectedQuestionId) ??
  questions[0];

  const isEditMode = Boolean(moduleId);
  const isBusy = loadStatus === "loading" || saveStatus === "loading";

  const authHeaders = useCallback(async () => {
    const supabase = createBrowserSupabaseClient();

    if (!supabase) {
      throw new Error("Supabase environment variables are not configured.");
    }

    const { data, error } = await supabase.auth.getSession();

    if (error || !data.session?.access_token) {
      throw new Error(error?.message || "Sign in before managing trainings.");
    }

    return {
      Authorization: `Bearer ${data.session.access_token}`,
    };
  }, []);

  const selectedQuestionPayload = useMemo(
    () =>
      questions
        .filter(
          (question) =>
            question.question.trim().length > 0 ||
            question.answers.some((answer) => answer.trim().length > 0)
        )
        .map((question) => ({
          question_text: question.question,
          question_type: question.questionType || "multiple_choice",
          answer_a:
            question.questionType === "true_false"
              ? "True"
              : question.answers[0] ?? "",
          answer_b:
            question.questionType === "true_false"
              ? "False"
              : question.answers[1] ?? "",
          answer_c:
            question.questionType === "true_false"
              ? null
              : question.answers[2] ?? "",
          answer_d:
            question.questionType === "true_false"
              ? null
              : question.answers[3] ?? "",
          correct_answer: mapQuestionToCorrectAnswer(question.correctAnswerIndex),
          points: question.points ?? 1,
          explanation: question.explanation ?? null,
        })),
    [questions]
  );

  function updateFormField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setFormState((current) => ({ ...current, [field]: value }));
  }

  function updateTrainingAudience(value: string) {
    updateFormField("trainingAudience", value);
    setAudienceError("");

    if (value === "all") {
      setSelectedPositionIds([]);
    }
  }

  function updateSelectedPosition(positionId: string, isSelected: boolean) {
    setAudienceError("");
    setSelectedPositionIds((currentPositionIds) =>
      isSelected
        ? Array.from(new Set([...currentPositionIds, positionId]))
        : currentPositionIds.filter(
            (currentPositionId) => currentPositionId !== positionId
          )
    );
  }

  function selectAllPositions() {
    setAudienceError("");
    setSelectedPositionIds(positions.map((position) => position.id));
  }

  function deselectAllPositions() {
    setAudienceError("");
    setSelectedPositionIds([]);
  }

  useEffect(() => {
    let isMounted = true;

    async function loadAudienceMetadata() {
      setPositionsStatus("loading");

      try {
        const headers = await authHeaders();
        const response = await fetch("/api/training?metadata=audience", {
          headers,
        });
        const data = (await response.json().catch(() => null)) as
          | TrainingAudienceMetadataResponse
          | { error?: string }
          | null;

        if (!response.ok) {
          throw new Error(
            getReadableErrorMessage(data, "Unable to load assigned positions.")
          );
        }

        const metadata = data as TrainingAudienceMetadataResponse;

        if (!isMounted) return;

        setPositions(metadata.positions);
        setPositionsStatus("success");
      } catch (error) {
        if (!isMounted) return;

        setPositionsStatus("error");
        setFormMessage(
          error instanceof Error ? error.message : "Unable to load assigned positions."
        );
      }
    }

    loadAudienceMetadata();

    return () => {
      isMounted = false;
    };
  }, [authHeaders]);

  useEffect(() => {
    const nextModuleId = new URLSearchParams(window.location.search).get("id");

    if (!nextModuleId) return;

    const moduleIdToLoad = nextModuleId;
    let isMounted = true;

    async function loadTraining() {
      setModuleId(moduleIdToLoad);
      setLoadStatus("loading");
      setFormMessage("");

      try {
        const headers = await authHeaders();
        const response = await fetch(
          `/api/training?id=${encodeURIComponent(moduleIdToLoad)}`,
          {
            headers,
          }
        );
        const data = (await response.json().catch(() => null)) as
          | TrainingDetailResponse
          | { error?: string }
          | null;

        if (!response.ok) {
          throw new Error(getReadableErrorMessage(data, "Unable to load training."));
        }

        const detail = data as TrainingDetailResponse;

        if (!isMounted) return;

        setTrainingTitle(detail.module.title);
        setFormState({
          description: detail.module.description || "",
          category: detail.module.category || "",
          estimatedMinutes:
            detail.module.estimated_minutes === null
              ? ""
              : String(detail.module.estimated_minutes),
          trainingAudience: detail.module.training_audience || "all",
          passingScore: String(detail.module.passing_score ?? 80),
          allowRetake: detail.module.allow_retake,
          maxAttempts:
            detail.module.max_attempts === null ? "" : String(detail.module.max_attempts),
          renewalPeriodDays:
            detail.module.renewal_period_days === null
              ? ""
              : String(detail.module.renewal_period_days),
          daysAllowed:
            detail.module.days_allowed === null
              ? ""
              : String(detail.module.days_allowed),
        });
        setPositions(detail.positions);
        setSelectedPositionIds(detail.selected_position_ids);

        const loadedSlides =
          detail.slides.length > 0
            ? detail.slides.map((slide, index) => ({
                id: index + 1,
                title: slide.title,
                body: slide.body || "",
                media: slide.image_url
                  ? {
                      type: "image" as const,
                      url: slide.image_url,
                      alt: slide.title ? `${slide.title} image` : "Lesson slide image",
                    }
                  : undefined,
                isComplete: true,
              }))
            : [{ id: 1, title: "", body: "", isComplete: false }];

        setSlides(loadedSlides);
        setSelectedSlideId(loadedSlides[0].id);

        const loadedQuestions =
          detail.quiz_questions.length > 0
            ? detail.quiz_questions.map((question, index) => ({
                id: index + 1,
                question: question.question_text,
                answers: [
                  question.answer_a || "",
                  question.answer_b || "",
                  question.answer_c || "",
                  question.answer_d || "",
                ],
                correctAnswerIndex: mapCorrectAnswerToIndex(question.correct_answer),
                isComplete: true,
                questionType: question.question_type,
                points: question.points,
                explanation: question.explanation,
              }))
            : [
                {
                  id: 1,
                  question: "",
                  answers: ["", "", "", ""],
                  correctAnswerIndex: 0,
                  isComplete: false,
                },
              ];

        setQuestions(loadedQuestions);
        setSelectedQuestionId(loadedQuestions[0].id);
        setLoadStatus("success");
      } catch (error) {
        if (!isMounted) return;

        setLoadStatus("error");
        setFormMessage(
          error instanceof Error ? error.message : "Unable to load training."
        );
      }
    }

    loadTraining();

    return () => {
      isMounted = false;
    };
  }, [authHeaders]);

  async function saveTraining(status: "draft" | "published") {
    setSaveStatus("loading");
    setFormMessage("");
    setAudienceError("");

    if (
      formState.trainingAudience === "position_specific" &&
      selectedPositionIds.length === 0
    ) {
      setSaveStatus("error");
      setAudienceError("Choose at least one assigned position.");
      setFormMessage("Choose at least one assigned position.");
      return;
    }

    const payload = {
      id: moduleId,
      title: trainingTitle,
      description: formState.description,
      category: formState.category,
      training_audience: formState.trainingAudience,
      passing_score: formState.passingScore,
      estimated_minutes: formState.estimatedMinutes,
      status: normalizeStatus(status),
      allow_retake: formState.allowRetake,
      max_attempts: formState.maxAttempts,
      renewal_period_days: formState.renewalPeriodDays,
      days_allowed: formState.daysAllowed,
      assigned_position_ids:
        formState.trainingAudience === "position_specific"
          ? selectedPositionIds
          : [],
      slides: slides.map((slide, index) => ({
        title: slide.title || `Slide ${index + 1}`,
        body: slide.body,
        image_url: slide.media?.url || null,
        slide_type: "content",
        speaker_notes: null,
        estimated_seconds: null,
      })),
      quiz_questions: selectedQuestionPayload,
    };

    try {
      const headers = await authHeaders();
      const response = await fetch("/api/training", {
        method: moduleId ? "PATCH" : "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => null)) as
        | TrainingDetailResponse
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(getReadableErrorMessage(data, "Unable to save training."));
      }

      const detail = data as TrainingDetailResponse;
      setModuleId(detail.module.id);
      window.history.replaceState(null, "", `/training/new?id=${detail.module.id}`);
      setSaveStatus("success");
      setFormMessage(
        status === "published" ? "Training published." : "Training draft saved."
      );
    } catch (error) {
      setSaveStatus("error");
      setFormMessage(
        error instanceof Error ? error.message : "Unable to save training."
      );
    }
  }

  return (
    <AdminLayout
      title={isEditMode ? "Edit Training" : "Add Training"}
      description={
        isEditMode
          ? "Update an employee training module."
          : "Create a new employee training module."
      }
    >
      {loadStatus === "loading" && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700">
          Loading training from Supabase.
        </div>
      )}

      {formMessage && (
        <div
          className={`mb-6 rounded-lg border px-4 py-3 text-sm font-medium ${
            saveStatus === "success"
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {formMessage}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_520px] 2xl:grid-cols-[minmax(0,1fr)_560px]">
        <div className="space-y-6">
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <div className="border-b border-slate-200 pb-5">
              <h2 className="text-lg font-bold text-slate-900">
                Training Information
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Basic details employees and managers will see.
              </p>
            </div>

            <form className="mt-6 space-y-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700">
                  Training Title
                </label>
                <input
                  type="text"
                  value={trainingTitle}
                  onChange={(event) => setTrainingTitle(event.target.value)}
                  placeholder="Example: Hospitality 101"
                  className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700">
                  Description
                </label>
                <textarea
                  value={formState.description}
                  onChange={(event) =>
                    updateFormField("description", event.target.value)
                  }
                  placeholder="Briefly describe what this training covers..."
                  rows={4}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-600"
                />
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-semibold text-slate-700">
                    Category
                  </label>
                  <input
                    type="text"
                    value={formState.category}
                    onChange={(event) =>
                      updateFormField("category", event.target.value)
                    }
                    placeholder="Customer Service"
                    className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700">
                    Estimated Minutes
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formState.estimatedMinutes}
                    onChange={(event) =>
                      updateFormField("estimatedMinutes", event.target.value)
                    }
                    placeholder="15"
                    className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-semibold text-slate-700">
                    Audience
                  </label>
                  <select
                    value={formState.trainingAudience}
                    onChange={(event) =>
                      updateTrainingAudience(event.target.value)
                    }
                    className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-600"
                  >
                    <option value="all">All Employees</option>
                    <option value="position_specific">Position Specific</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700">
                    Passing Score
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={formState.passingScore}
                    onChange={(event) =>
                      updateFormField("passingScore", event.target.value)
                    }
                    placeholder="80"
                    className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              {formState.trainingAudience === "position_specific" && (
                <div>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700">
                        Assigned Positions
                      </label>
                      <p className="mt-1 text-sm text-slate-500">
                        Choose who should be assigned this training.
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={selectAllPositions}
                        disabled={positions.length === 0}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        onClick={deselectAllPositions}
                        disabled={selectedPositionIds.length === 0}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Deselect All
                      </button>
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    {positionsStatus === "loading" ? (
                      <p className="text-sm font-medium text-slate-500">
                        Loading positions...
                      </p>
                    ) : positions.length === 0 ? (
                      <p className="text-sm font-medium text-slate-500">
                        No active positions exist for this company.
                      </p>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {positions.map((position) => (
                          <label
                            key={position.id}
                            className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                          >
                            <input
                              type="checkbox"
                              checked={selectedPositionIds.includes(position.id)}
                              onChange={(event) =>
                                updateSelectedPosition(
                                  position.id,
                                  event.target.checked
                                )
                              }
                              className="h-4 w-4"
                            />
                            {position.name}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  {audienceError && (
                    <p className="mt-2 text-sm font-medium text-red-600">
                      {audienceError}
                    </p>
                  )}

                </div>
              )}
            </form>
          </div>

          <SlideBuilder
  slides={slides}
  setSlides={setSlides}
  selectedSlideId={selectedSlideId}
  setSelectedSlideId={(id) => {
    setSelectedSlideId(id);
    setActivePreview("lesson");
  }}
  onFocusBuilder={() => setActivePreview("lesson")}
/>

          <QuizBuilder
  questions={questions}
  setQuestions={setQuestions}
  selectedQuestionId={selectedQuestionId}
  setSelectedQuestionId={(id) => {
    setSelectedQuestionId(id);
    setActivePreview("quiz");
  }}
  onFocusBuilder={() => setActivePreview("quiz")}
/>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
            <h3 className="font-bold text-slate-900">Retake Rules</h3>

            <div className="mt-4 grid gap-6 md:grid-cols-2">
              <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={formState.allowRetake}
                  onChange={(event) =>
                    updateFormField("allowRetake", event.target.checked)
                  }
                />
                Allow retakes
              </label>

              <div>
                <label className="block text-sm font-semibold text-slate-700">
                  Max Attempts
                </label>
                <input
                  type="number"
                  min="1"
                  value={formState.maxAttempts}
                  onChange={(event) =>
                    updateFormField("maxAttempts", event.target.value)
                  }
                  placeholder="Leave blank for unlimited"
                  className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-600"
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
            <h3 className="font-bold text-slate-900">Renewal Rules</h3>

            <div className="mt-4 grid gap-6 md:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold text-slate-700">
                  Days Allowed
                </label>
                <input
                  type="number"
                  min="1"
                  value={formState.daysAllowed}
                  onChange={(event) =>
                    updateFormField("daysAllowed", event.target.value)
                  }
                  placeholder="Leave blank for no due date"
                  className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-600"
                />
              </div>

              <div>
              <label className="block text-sm font-semibold text-slate-700">
                Renewal Period Days
              </label>
              <input
                type="number"
                min="1"
                value={formState.renewalPeriodDays}
                onChange={(event) =>
                  updateFormField("renewalPeriodDays", event.target.value)
                }
                placeholder="Example: 365, or leave blank if it does not expire"
                className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-600"
              />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-200 pt-6">
            <a
              href="/training"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </a>

            <a
              href="/training/preview"
              className="rounded-lg border border-blue-600 px-4 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50"
            >
              Preview
            </a>

            <button
              type="button"
              disabled={isBusy}
              onClick={() => saveTraining("draft")}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saveStatus === "loading" ? "Saving..." : "Save Draft"}
            </button>

            <button
              type="button"
              disabled={isBusy}
              onClick={() => saveTraining("published")}
              className="company-primary-button rounded-lg px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
            >
              Publish
            </button>
          </div>
        </div>

        <aside className="hidden xl:block">
          <div className="sticky top-6">
            <div className="mb-4 flex items-start justify-between">
  <div>
    <p className="text-sm font-bold text-slate-900">
      Live Preview
    </p>

    <p className="text-sm text-slate-500">
      Employee View
    </p>
  </div>

  <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
    {activePreview === "lesson" ? "Lesson" : "Quiz"}
  </span>
</div>

            {activePreview === "lesson" ? (
                <SlidePreviewCard
                  title={trainingTitle || "Untitled Training"}
                  slides={slides}
                  selectedSlideId={selectedSlideId}
                  onSlideChange={(id) => {
                    setSelectedSlideId(id);
                    setActivePreview("lesson");
                  }}
                />
              ) : (
                <QuizViewer question={selectedQuestion} />
              )}
          </div>
        </aside>

        <div className="xl:hidden">
         <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="text-sm font-bold text-slate-900">
              Live Preview
            </p>

            <p className="text-sm text-slate-500">
              Employee View
            </p>
          </div>

          <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
            {activePreview === "lesson" ? "Lesson" : "Quiz"}
          </span>
        </div>

          {activePreview === "lesson" ? (
            <SlidePreviewCard
              title={trainingTitle || "Untitled Training"}
              slides={slides}
              selectedSlideId={selectedSlideId}
              onSlideChange={(id) => {
                setSelectedSlideId(id);
                setActivePreview("lesson");
              }}
            />
          ) : (
            <QuizViewer question={selectedQuestion} />
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
