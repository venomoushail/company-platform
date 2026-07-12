"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AdminLayout from "@/components/layout/AdminLayout";
import TrainingViewer from "@/components/training/LessonViewer";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type {
  Position,
  QuizQuestionRow,
  TrainingModule,
  TrainingSlide,
} from "@/types/supabase";

type PreviewStatus = "loading" | "success" | "error";

type TrainingDetailResponse = {
  module: TrainingModule;
  slides: TrainingSlide[];
  quiz_questions: QuizQuestionRow[];
  positions: Position[];
  selected_position_ids: string[];
};

function getReadableErrorMessage(data: unknown, fallback: string) {
  if (!data || typeof data !== "object") return fallback;

  const error = (data as { error?: unknown }).error;
  return typeof error === "string" && error.trim() ? error : fallback;
}

export default function TrainingModulePreviewPage() {
  const params = useParams<{ moduleId: string }>();
  const router = useRouter();
  const moduleId = params.moduleId;
  const [status, setStatus] = useState<PreviewStatus>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [trainingDetail, setTrainingDetail] =
    useState<TrainingDetailResponse | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadPreview() {
      setStatus("loading");
      setErrorMessage("");

      const supabase = createBrowserSupabaseClient();

      if (!supabase) {
        setStatus("error");
        setErrorMessage("Supabase environment variables are not configured.");
        return;
      }

      const { data, error } = await supabase.auth.getSession();

      if (!isMounted) return;

      if (error || !data.session?.access_token) {
        router.replace(
          `/login?next=${encodeURIComponent(`/training/${moduleId}/preview`)}`
        );
        return;
      }

      const response = await fetch(
        `/api/training?id=${encodeURIComponent(moduleId)}`,
        {
          headers: {
            Authorization: `Bearer ${data.session.access_token}`,
          },
        }
      );
      const responseData = (await response.json().catch(() => null)) as
        | TrainingDetailResponse
        | { error?: string }
        | null;

      if (!isMounted) return;

      if (!response.ok) {
        setStatus("error");
        setErrorMessage(
          getReadableErrorMessage(responseData, "Unable to load this training preview.")
        );
        return;
      }

      setTrainingDetail(responseData as TrainingDetailResponse);
      setStatus("success");
    }

    loadPreview();

    return () => {
      isMounted = false;
    };
  }, [moduleId, router]);

  const viewerSlides = useMemo(
    () =>
      (trainingDetail?.slides ?? []).map((slide, index) => ({
        id: index + 1,
        title: slide.title,
        body: slide.body || "",
        slide_type: slide.slide_type,
        config_json: slide.config_json ?? {},
        media: slide.image_url
          ? {
              type: "image" as const,
              url: slide.image_url,
              alt: slide.title ? `${slide.title} image` : "Training block image",
            }
          : undefined,
      })),
    [trainingDetail?.slides]
  );

  return (
    <AdminLayout
      title="Training Preview"
      description="Preview the current saved draft without recording employee progress."
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-500">
            {trainingDetail
              ? `${viewerSlides.length} learning blocks, ${trainingDetail.quiz_questions.length} quiz questions`
              : "Loading training preview"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push(`/training/new?id=${moduleId}`)}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Back to Editor
        </button>
      </div>

      {status === "loading" && (
        <div className="rounded-xl bg-white p-8 text-center shadow-sm">
          <p className="font-semibold text-slate-900">Loading preview</p>
          <p className="mt-2 text-sm text-slate-500">
            Fetching the saved training blocks.
          </p>
        </div>
      )}

      {status === "error" && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6">
          <p className="font-semibold text-red-800">Preview unavailable</p>
          <p className="mt-2 text-sm leading-6 text-red-700">{errorMessage}</p>
        </div>
      )}

      {status === "success" && trainingDetail && viewerSlides.length === 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
          <p className="font-semibold text-amber-900">No learning blocks</p>
          <p className="mt-2 text-sm leading-6 text-amber-800">
            This training has no saved learning blocks yet. Return to the editor and
            add content before previewing.
          </p>
        </div>
      )}

      {status === "success" && trainingDetail && viewerSlides.length > 0 && (
        <TrainingViewer
          mode="preview"
          title={trainingDetail.module.title}
          slides={viewerSlides}
          finalActionLabel="Finish Preview"
          completeLabel="Preview Complete"
        />
      )}
    </AdminLayout>
  );
}
