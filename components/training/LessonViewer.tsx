"use client";

type TrainingSlide = {
  id: number;
  title: string;
  body: string;
};

type TrainingViewerProps = {
  title: string;
  slides: TrainingSlide[];
  selectedSlideId?: number;
};

export default function TrainingViewer({
  title,
  slides,
  selectedSlideId,
}: TrainingViewerProps) {
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

  const currentSlide =
  slides.find((slide) => String(slide.id) === String(selectedSlideId)) ??
  slides[0];

const safeSlideIndex = slides.findIndex(
  (slide) => String(slide.id) === String(currentSlide.id)
);

const progress = ((safeSlideIndex + 1) / slides.length) * 100;

  return (
    <div className="mx-auto rounded-xl bg-white p-8 shadow-sm">
      <div className="mb-6">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-semibold text-blue-600">{title}</p>

          <p className="text-sm text-slate-500">
            Slide {safeSlideIndex + 1} of {slides.length}
          </p>
        </div>

        <div className="h-2 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-blue-600"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="border-b border-slate-200 pb-8">
        <h2 className="text-3xl font-bold text-slate-900">
          {currentSlide.title || "Untitled Slide"}
        </h2>

        <p className="mt-6 text-xl leading-9 text-slate-700">
          {currentSlide.body || "Slide content will appear here."}
        </p>
      </div>

      <div className="mt-6 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500">
        Live preview follows the selected slide in the builder.
      </div>
    </div>
  );
}