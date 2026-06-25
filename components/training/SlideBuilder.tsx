"use client";

import { Dispatch, SetStateAction, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export type Slide = {
  id: number;
  title: string;
  body: string;
};

type SlideBuilderProps = {
  slides: Slide[];
  setSlides: Dispatch<SetStateAction<Slide[]>>;
};

type SortableSlideButtonProps = {
  slide: Slide;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
};

function SortableSlideButton({
  slide,
  index,
  isSelected,
  onSelect,
}: SortableSlideButtonProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: slide.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const wordCount = slide.body.trim()
    ? slide.body.trim().split(/\s+/).length
    : 0;

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? "opacity-60" : ""}>
      <button
        type="button"
        onClick={onSelect}
        className={`w-full rounded-lg border px-3 py-3 text-left text-sm transition ${
          isSelected
            ? "border-blue-600 bg-blue-50 text-blue-700"
            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        }`}
      >
        <div className="flex items-start gap-3">
          <span
            {...attributes}
            {...listeners}
            className={`mt-0.5 flex h-7 w-7 shrink-0 cursor-grab items-center justify-center rounded-full text-xs font-bold active:cursor-grabbing ${
              isSelected ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"
            }`}
            title="Drag to reorder"
          >
            ☰
          </span>

          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">
              {index + 1}. {slide.title || "Untitled Slide"}
            </p>

            <p className="mt-1 line-clamp-2 text-xs text-slate-500">
              {slide.body || "No content added yet."}
            </p>

            <p className="mt-2 text-xs text-slate-400">
              {wordCount} {wordCount === 1 ? "word" : "words"}
            </p>
          </div>
        </div>
      </button>
    </div>
  );
}

export default function SlideBuilder({
  slides,
  setSlides,
}: SlideBuilderProps) {
  const [selectedSlideId, setSelectedSlideId] = useState(1);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    })
  );

  const selectedSlide =
    slides.find((slide) => slide.id === selectedSlideId) ?? slides[0];

  const selectedSlideIndex = slides.findIndex(
    (slide) => slide.id === selectedSlide.id
  );

  function addSlide() {
    const newSlide = {
      id: Date.now(),
      title: "",
      body: "",
    };

    setSlides([...slides, newSlide]);
    setSelectedSlideId(newSlide.id);
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

    const slideIndex = slides.findIndex((slide) => slide.id === id);
    const updatedSlides = slides.filter((slide) => slide.id !== id);

    setSlides(updatedSlides);

    if (selectedSlideId === id) {
      const nextSlide = updatedSlides[slideIndex] ?? updatedSlides[slideIndex - 1];
      setSelectedSlideId(nextSlide.id);
    }
  }

  function duplicateSlide(id: number) {
    const slideToCopy = slides.find((slide) => slide.id === id);
    if (!slideToCopy) return;

    const copiedSlide: Slide = {
      ...slideToCopy,
      id: Date.now(),
      title: slideToCopy.title
        ? `${slideToCopy.title} Copy`
        : "Untitled Slide Copy",
    };

    const slideIndex = slides.findIndex((slide) => slide.id === id);
    const updatedSlides = [...slides];

    updatedSlides.splice(slideIndex + 1, 0, copiedSlide);

    setSlides(updatedSlides);
    setSelectedSlideId(copiedSlide.id);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const oldIndex = slides.findIndex((slide) => slide.id === active.id);
    const newIndex = slides.findIndex((slide) => slide.id === over.id);

    setSlides(arrayMove(slides, oldIndex, newIndex));
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-slate-900">Training Slides</h3>
          <p className="text-sm text-slate-500">
            Build the lesson one slide at a time.
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

      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="mb-3 px-2 text-xs font-bold uppercase tracking-wide text-slate-400">
            Course Outline
          </p>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={slides.map((slide) => slide.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {slides.map((slide, index) => (
                  <SortableSlideButton
                    key={slide.id}
                    slide={slide}
                    index={index}
                    isSelected={slide.id === selectedSlideId}
                    onSelect={() => setSelectedSlideId(slide.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </aside>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-5 flex items-start justify-between gap-4 border-b border-slate-200 pb-5">
            <div>
              <p className="text-sm font-semibold text-blue-600">
                Slide {selectedSlideIndex + 1} of {slides.length}
              </p>
              <h4 className="mt-1 text-lg font-bold text-slate-900">
                {selectedSlide.title || "Untitled Slide"}
              </h4>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => duplicateSlide(selectedSlide.id)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Duplicate
              </button>

              <button
                type="button"
                onClick={() => deleteSlide(selectedSlide.id)}
                disabled={slides.length === 1}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:text-slate-300"
              >
                Delete
              </button>
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700">
                Slide Title
              </label>
              <input
                type="text"
                value={selectedSlide.title}
                onChange={(event) =>
                  updateSlide(selectedSlide.id, "title", event.target.value)
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
                value={selectedSlide.body}
                onChange={(event) =>
                  updateSlide(selectedSlide.id, "body", event.target.value)
                }
                placeholder="Write the training content for this slide..."
                rows={10}
                className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-sm leading-6 text-slate-900 outline-none focus:border-blue-600"
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}