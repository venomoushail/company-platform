"use client";

import { useEffect, useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { TrainingModule } from "@/types/supabase";

type TrainingListResponse = {
  modules: TrainingModule[];
};

type PageStatus = "idle" | "loading" | "success" | "error";

function getReadableErrorMessage(data: unknown, fallback: string) {
  if (!data || typeof data !== "object") return fallback;

  const error = (data as { error?: unknown }).error;
  return typeof error === "string" ? error : fallback;
}

function formatStatus(status: string) {
  return status
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatAudience(audience: string) {
  if (audience === "all") return "All Employees";
  if (audience === "position_specific") return "Position Specific";

  return formatStatus(audience);
}

function formatUpdatedDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export default function TrainingPage() {
  const [trainingModules, setTrainingModules] = useState<TrainingModule[]>([]);
  const [pageStatus, setPageStatus] = useState<PageStatus>("loading");
  const [pageError, setPageError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function fetchTrainingModules() {
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
        setPageStatus("error");
        setPageError(error?.message || "Sign in to view training modules.");
        return;
      }

      const response = await fetch("/api/training", {
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
        },
      });
      const responseData = (await response.json().catch(() => null)) as
        | TrainingListResponse
        | { error?: string }
        | null;

      if (!isMounted) return;

      if (!response.ok) {
        setPageStatus("error");
        setPageError(
          getReadableErrorMessage(responseData, "Unable to load training modules.")
        );
        return;
      }

      setTrainingModules((responseData as TrainingListResponse).modules);
      setPageStatus("success");
    }

    fetchTrainingModules();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <AdminLayout
      title="Training"
      description="Create and manage employee training modules."
    >
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Training Modules
          </h2>
          <p className="text-sm text-slate-500">
            Manage courses, quizzes, passing scores, and renewal rules.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <a
            href="/training/import"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Import Training
          </a>
          <a
            href="/training/new"
            className="company-primary-button rounded-lg px-4 py-2 text-center text-sm font-semibold"
          >
            + Add Training
          </a>
        </div>
      </div>

      {pageError && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {pageError}
        </div>
      )}

      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="w-full border-collapse text-left">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                Title
              </th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                Category
              </th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                Audience
              </th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                Time
              </th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                Days Allowed
              </th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                Status
              </th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                Updated
              </th>
              <th className="px-6 py-4 text-right text-sm font-semibold text-slate-600">
                Actions
              </th>
            </tr>
          </thead>

          <tbody>
            {pageStatus === "loading" ? (
              <tr>
                <td className="px-6 py-8 text-sm text-slate-500" colSpan={8}>
                  Loading training modules from Supabase.
                </td>
              </tr>
            ) : trainingModules.length === 0 ? (
              <tr>
                <td className="px-6 py-8 text-sm text-slate-500" colSpan={8}>
                  No training modules found.
                </td>
              </tr>
            ) : (
              trainingModules.map((module) => (
                <tr
                  key={module.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <td className="px-6 py-4">
                    <p className="font-medium text-slate-900">
                      {module.title}
                    </p>
                  </td>

                  <td className="px-6 py-4 text-sm text-slate-600">
                    {module.category || "Uncategorized"}
                  </td>

                  <td className="px-6 py-4 text-sm text-slate-600">
                    {formatAudience(module.training_audience)}
                  </td>

                  <td className="px-6 py-4 text-sm text-slate-600">
                    {module.estimated_minutes === null
                      ? "Not set"
                      : `${module.estimated_minutes} min`}
                  </td>

                  <td className="px-6 py-4 text-sm text-slate-600">
                    {module.days_allowed === null
                      ? "Not set"
                      : `${module.days_allowed} days`}
                  </td>

                  <td className="px-6 py-4">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        module.status === "published"
                          ? "bg-green-100 text-green-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {formatStatus(module.status)}
                    </span>
                  </td>

                  <td className="px-6 py-4 text-sm text-slate-600">
                    {formatUpdatedDate(module.updated_at)}
                  </td>

                  <td className="px-6 py-4 text-right">
                    <a
                      href={`/training/new?id=${module.id}`}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white"
                    >
                      Edit
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
