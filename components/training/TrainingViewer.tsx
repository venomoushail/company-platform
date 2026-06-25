"use client";

import { useEffect, useState } from "react";

type TrainingSlide = {
  id: number;
  title: string;
  body: string;
};

type TrainingViewerProps = {
  title: string;
  slides: TrainingSlide[];
};

export default function TrainingViewer({ title, slides }: TrainingViewerProps) {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);

  useEffect(() => {
    if (currentSlideIndex >= slides.length) {
      setCurrentSlideIndex(0);
    }
  }, [slides.length, currentSlideIndex]);

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
  const isFirstSlide = currentSlideIndex === 0;
  const isLastSlide = currentSlideIndex === slides.length - 1;
  const progress = ((currentSlideIndex + 1) / slides.length) * 100;

  function goPrevious() {
    if (!isFirstSlide) {
      setCurrentSlideIndex(currentSlideIndex - 1);
    }
  }

  function goNext() {
    if (!isLastSlide) {
      setCurrentSlideIndex(currentSlideIndex + 1);
    }
  }

  return (
    <div className="mx-auto rounded-xl bg-white p-8 shadow-sm">
      <div className="mb-6">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-semibold text-blue-600">
            {title}
          </p>

          <p className="text-sm text-slate-500">
            Slide {currentSlideIndex + 1} of {slides.length}
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

      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={goPrevious}
          disabled={isFirstSlide}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:text-slate-300"
        >
          Previous
        </button>

        <button
          type="button"
          onClick={goNext}
          disabled={isLastSlide}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-300"
        >
          {isLastSlide ? "Begin Quiz" : "Next"}
        </button>
      </div>
    </div>
  );
}