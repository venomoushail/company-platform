"use client";

import { useMemo, useState } from "react";
import {
  RenderedSlide,
  type RenderedSlideData,
} from "@/components/training/RenderedSlide";
import { ChevronLeft, ChevronRight, CheckCircle2 } from "lucide-react";

type TrainingSlide = RenderedSlideData;

type TrainingViewerProps = {
  title: string;
  slides: TrainingSlide[];
  selectedSlideId?: number;
  onSlideChange?: (slideId: number) => void;
  onComplete?: () => void;
  finalActionLabel?: string;
  completeLabel?: string;
};

type SlideNavigationPaneProps = {
  title: string;
  slides: TrainingSlide[];
  activeSlideId: number;
  onSelectSlide: (slideId: number) => void;
};

type SlideControlsProps = {
  isFirstSlide: boolean;
  isLastSlide: boolean;
  isComplete: boolean;
  finalActionLabel: string;
  completeLabel: string;
  onPrevious: () => void;
  onNext: () => void;
};

function getSlideLabel(slide: TrainingSlide, index: number) {
  return slide.title.trim() || `Slide ${index + 1}`;
}

function SlideNavigationPane({
  title,
  slides,
  activeSlideId,
  onSelectSlide,
}: SlideNavigationPaneProps) {
  return (
    <aside className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
          Course
        </p>
        <h2 className="mt-1 text-base font-bold text-slate-900">
          {title || "Untitled Training"}
        </h2>
      </div>

      <nav className="space-y-1 p-3" aria-label="Lesson slides">
        {slides.map((slide, index) => {
          const isActive = String(slide.id) === String(activeSlideId);

          return (
            <button
              key={slide.id}
              type="button"
              onClick={() => onSelectSlide(slide.id)}
              className={`flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left text-sm transition ${
                isActive
                  ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <span
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  isActive
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {index + 1}
              </span>

              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 font-semibold">
                  {getSlideLabel(slide, index)}
                </span>
                {slide.media?.type === "image" && (
                  <span className="mt-1 block text-xs text-slate-400">
                    Includes image
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

function SlideContent({ slide }: { slide: TrainingSlide }) {
  return (
    <div className="border-b border-slate-200 pb-8">
      <RenderedSlide slide={slide} />
    </div>
  );
}

function SlideControls({
  isFirstSlide,
  isLastSlide,
  isComplete,
  finalActionLabel,
  completeLabel,
  onPrevious,
  onNext,
}: SlideControlsProps) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
      <button
        type="button"
        onClick={onPrevious}
        disabled={isFirstSlide}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
      >
        <ChevronLeft size={17} strokeWidth={2.4} />
        Previous
      </button>

      <button
        type="button"
        onClick={onNext}
        disabled={isComplete}
        className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition ${
          isComplete
            ? "cursor-default bg-green-600"
            : "bg-blue-600 hover:bg-blue-700"
        }`}
      >
        {isComplete ? (
          <>
            <CheckCircle2 size={17} strokeWidth={2.4} />
            {completeLabel}
          </>
        ) : isLastSlide ? (
          <>
            {finalActionLabel}
            <CheckCircle2 size={17} strokeWidth={2.4} />
          </>
        ) : (
          <>
            Next
            <ChevronRight size={17} strokeWidth={2.4} />
          </>
        )}
      </button>
    </div>
  );
}

export default function TrainingViewer({
  title,
  slides,
  selectedSlideId,
  onSlideChange,
  onComplete,
  finalActionLabel = "Finish Lesson",
  completeLabel = "Lesson Complete",
}: TrainingViewerProps) {
  const firstSlideId = slides[0]?.id;
  const [internalActiveSlideId, setInternalActiveSlideId] = useState<
    number | undefined
  >(firstSlideId);
  const [isComplete, setIsComplete] = useState(false);
  const activeSlideId = selectedSlideId ?? internalActiveSlideId ?? firstSlideId;

  const currentSlideIndex = useMemo(() => {
    const foundIndex = slides.findIndex(
      (slide) => String(slide.id) === String(activeSlideId)
    );

    return foundIndex >= 0 ? foundIndex : 0;
  }, [activeSlideId, slides]);

  if (slides.length === 0) {
    return (
      <div className="rounded-xl bg-white p-8 text-center shadow-sm">
        <p className="font-semibold text-slate-900">No slides yet</p>
        <p className="mt-2 text-sm text-slate-500">
          Add a slide to preview the employee experience.
        </p>
      </div>
    );
  }

  const currentSlide = slides[currentSlideIndex];
  const progress = ((currentSlideIndex + 1) / slides.length) * 100;
  const isFirstSlide = currentSlideIndex === 0;
  const isLastSlide = currentSlideIndex === slides.length - 1;

  function selectSlide(slideId: number) {
    setInternalActiveSlideId(slideId);
    onSlideChange?.(slideId);
    setIsComplete(false);
  }

  function goToPreviousSlide() {
    if (isFirstSlide) return;

    selectSlide(slides[currentSlideIndex - 1].id);
    setIsComplete(false);
  }

  function goToNextSlide() {
    if (!isLastSlide) {
      selectSlide(slides[currentSlideIndex + 1].id);
      return;
    }

    // TODO: Connect this to persisted lesson progress once the app has a
    // Supabase completion/enrollment pattern for employee course attempts.
    setIsComplete(true);
    onComplete?.();
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
      <SlideNavigationPane
        title={title}
        slides={slides}
        activeSlideId={currentSlide.id}
        onSelectSlide={selectSlide}
      />

      <main className="min-w-0 rounded-xl bg-white p-6 shadow-sm md:p-8">
        <div className="mb-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-blue-600">
              Slide {currentSlideIndex + 1} of {slides.length}
            </p>

            <p className="text-sm text-slate-500">
              {Math.round(progress)}% complete
            </p>
          </div>

          <div className="h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-blue-600 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <SlideContent slide={currentSlide} />

        <SlideControls
          isFirstSlide={isFirstSlide}
          isLastSlide={isLastSlide}
          isComplete={isComplete}
          finalActionLabel={finalActionLabel}
          completeLabel={completeLabel}
          onPrevious={goToPreviousSlide}
          onNext={goToNextSlide}
        />
      </main>
    </div>
  );
}
