import LessonContent from "@/components/training/LessonContent";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type RenderedSlideData = {
  id: number;
  title: string;
  body: string;
  media?: {
    type: "image";
    url: string;
    alt?: string;
  };
};

type RenderedSlideProps = {
  slide: RenderedSlideData;
  titleClassName?: string;
  imageClassName?: string;
  imageSizes?: string;
  contentClassName?: string;
  emptyContentClassName?: string;
  headingClassName?: string;
};

type SlidePreviewCardProps = {
  title: string;
  slides: RenderedSlideData[];
  selectedSlideId?: number;
  onSlideChange?: (slideId: number) => void;
};

export function RenderedSlide({
  slide,
  titleClassName = "text-3xl font-bold leading-tight text-slate-900",
  imageClassName = "h-80 rounded-xl",
  imageSizes = "(max-width: 768px) 100vw, 760px",
  contentClassName,
  emptyContentClassName,
  headingClassName,
}: RenderedSlideProps) {
  return (
    <>
      <h1 className={titleClassName}>{slide.title || "Untitled Slide"}</h1>

      {slide.media?.type === "image" && (
        <div
          className={`relative mt-6 overflow-hidden border border-slate-200 bg-slate-50 ${imageClassName}`}
        >
          <Image
            src={slide.media.url}
            alt={slide.media.alt || ""}
            fill
            sizes={imageSizes}
            unoptimized
            className="object-contain"
          />
        </div>
      )}

      <div className="mt-6">
        <LessonContent
          content={slide.body}
          className={contentClassName}
          emptyClassName={emptyContentClassName}
          headingClassName={headingClassName}
        />
      </div>
    </>
  );
}

export function SlidePreviewCard({
  title,
  slides,
  selectedSlideId,
  onSlideChange,
}: SlidePreviewCardProps) {
  const currentSlideIndex = Math.max(
    slides.findIndex((slide) => String(slide.id) === String(selectedSlideId)),
    0
  );
  const currentSlide = slides[currentSlideIndex];
  const isFirstSlide = currentSlideIndex === 0;
  const isLastSlide = currentSlideIndex === slides.length - 1;

  function selectPreviewSlide(nextIndex: number) {
    const nextSlide = slides[nextIndex];

    if (nextSlide) {
      onSlideChange?.(nextSlide.id);
    }
  }

  if (!currentSlide) {
    return (
      <div className="rounded-xl bg-white p-6 text-center shadow-sm">
        <p className="font-semibold text-slate-900">No slides yet</p>
        <p className="mt-2 text-sm text-slate-500">
          Add a slide to preview the lesson content.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white p-6 shadow-sm">
      <div className="mb-5 border-b border-slate-200 pb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-blue-600">
            {title || "Untitled Training"}
          </p>

          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Slide {currentSlideIndex + 1} of {slides.length}
          </p>
        </div>
      </div>

      <RenderedSlide
        slide={currentSlide}
        titleClassName="text-2xl font-bold leading-8 text-slate-900"
        imageClassName="h-56 rounded-lg"
        imageSizes="(max-width: 768px) 100vw, 460px"
        contentClassName="space-y-4 text-base leading-7 text-slate-700"
        emptyContentClassName="text-base leading-7 text-slate-500"
        headingClassName="pt-1 text-xl font-bold leading-7 text-slate-900"
      />

      {slides.length > 1 && onSlideChange && (
        <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-200 pt-5">
          <button
            type="button"
            onClick={() => selectPreviewSlide(currentSlideIndex - 1)}
            disabled={isFirstSlide}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
            aria-label="Previous slide"
            title="Previous slide"
          >
            <ChevronLeft size={17} strokeWidth={2.4} />
          </button>

          <button
            type="button"
            onClick={() => selectPreviewSlide(currentSlideIndex + 1)}
            disabled={isLastSlide}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
            aria-label="Next slide"
            title="Next slide"
          >
            <ChevronRight size={17} strokeWidth={2.4} />
          </button>
        </div>
      )}
    </div>
  );
}
