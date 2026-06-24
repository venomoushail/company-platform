"use client";

import { useState } from "react";

type Slide = {
  id: number;
  title: string;
  body: string;
};

export default function SlideBuilder() {
  const [slides, setSlides] = useState<Slide[]>([
    {
      id: 1,
      title: "",
      body: "",
    },
  ]);

  function addSlide() {
    setSlides([
      ...slides,
      {
        id: Date.now(),
        title: "",
        body: "",
      },
    ]);
  }

  function updateSlide(id: number, field: "title" | "body", value: string) {
    setSlides(
      slides.map((slide) =>
        slide.id === id ? { ...slide, [field]: value } : slide
      )
    );
  }

  function deleteSlide(id: number) {
    if (slides.length === 1) return;
    setSlides(slides.filter((slide) => slide.id !== id));
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-slate-900">Training Slides</h3>
          <p className="text-sm text-slate-500">
            Break the lesson into simple step-by-step slides.
          </p>
        </div>

        <button
          type="button"
          onClick={addSlide}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          + Add Slide
        </button>
      </div>

      <div className="mt-5 space-y-5">
        {slides.map((slide, index) => (
          <div
            key={slide.id}
            className="rounded-xl border border-slate-200 bg-white p-5"
          >
            <div className="mb-4 flex items-center justify-between">
              <h4 className="font-semibold text-slate-900">
                Slide {index + 1}
              </h4>

              <button
                type="button"
                onClick={() => deleteSlide(slide.id)}
                disabled={slides.length === 1}
                className="text-sm font-semibold text-red-600 disabled:text-slate-300"
              >
                Delete
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700">
                  Slide Title
                </label>
                <input
                  type="text"
                  value={slide.title}
                  onChange={(event) =>
                    updateSlide(slide.id, "title", event.target.value)
                  }
                  placeholder="Example: Welcome to Hospitality 101"
                  className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700">
                  Slide Body
                </label>
                <textarea
                  value={slide.body}
                  onChange={(event) =>
                    updateSlide(slide.id, "body", event.target.value)
                  }
                  placeholder="Write the training content for this slide..."
                  rows={5}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-600"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}