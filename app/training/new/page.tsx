"use client";

import { useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import SlideBuilder, { Slide } from "@/components/training/SlideBuilder";
import QuizBuilder from "@/components/training/QuizBuilder";
import TrainingViewer from "@/components/training/TrainingViewer";

export default function NewTrainingPage() {
  const [trainingTitle, setTrainingTitle] = useState("");

  const [slides, setSlides] = useState<Slide[]>([
    {
      id: 1,
      title: "",
      body: "",
    },
  ]);

  return (
    <AdminLayout
      title="Add Training"
      description="Create a new employee training module."
    >
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
              <select className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-600">
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
                placeholder="80"
                className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-600"
              />
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
            <div className="space-y-6">
              <SlideBuilder slides={slides} setSlides={setSlides} />

              <QuizBuilder />
            </div>

            <div className="xl:sticky xl:top-6 xl:self-start">
              <div className="mb-3">
                <p className="text-sm font-bold text-slate-900">
                  Live Preview
                </p>
                <p className="text-sm text-slate-500">
                  This is what employees will see.
                </p>
              </div>

              <TrainingViewer
                title={trainingTitle || "Untitled Training"}
                slides={slides}
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
            <h3 className="font-bold text-slate-900">Retake Rules</h3>

            <div className="mt-4 grid gap-6 md:grid-cols-2">
              <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
                <input type="checkbox" defaultChecked />
                Allow retakes
              </label>

              <div>
                <label className="block text-sm font-semibold text-slate-700">
                  Max Attempts
                </label>
                <input
                  type="number"
                  placeholder="Leave blank for unlimited"
                  className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-600"
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
            <h3 className="font-bold text-slate-900">Renewal Rules</h3>

            <div className="mt-4">
              <label className="block text-sm font-semibold text-slate-700">
                Renewal Period Days
              </label>
              <input
                type="number"
                placeholder="Example: 365, or leave blank if it does not expire"
                className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-600"
              />
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
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Save Draft
            </button>

            <button
              type="button"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Publish
            </button>
          </div>
        </form>
      </div>
    </AdminLayout>
  );
}