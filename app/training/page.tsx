"use client";

import { useCallback, useEffect, useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { TrainingModule } from "@/types/supabase";

type TrainingListResponse = {
  modules: TrainingModule[];
};

type PageStatus = "idle" | "loading" | "success" | "error";
type ActionStatus = "idle" | "loading" | "success" | "error";

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
  const [actionStatus, setActionStatus] = useState<ActionStatus>("idle");
  const [actionMessage, setActionMessage] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<TrainingModule | null>(null);

  const getAccessToken = useCallback(async () => {
    const supabase = createBrowserSupabaseClient();

    if (!supabase) {
      throw new Error("Supabase environment variables are not configured.");
    }

    const { data, error } = await supabase.auth.getSession();

    if (error || !data.session?.access_token) {
      throw new Error(error?.message || "Sign in to manage training modules.");
    }

    return data.session.access_token;
  }, []);

  const loadTrainingModules = useCallback(async (showLoading = true) => {
    if (showLoading) setPageStatus("loading");
    setPageError("");

    const token = await getAccessToken();
    const response = await fetch("/api/training", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const responseData = (await response.json().catch(() => null)) as
      | TrainingListResponse
      | { error?: string }
      | null;

    if (!response.ok) {
      throw new Error(
        getReadableErrorMessage(responseData, "Unable to load training modules.")
      );
    }

    setTrainingModules((responseData as TrainingListResponse).modules);
    setPageStatus("success");
  }, [getAccessToken]);

  useEffect(() => {
    let isMounted = true;

    async function fetchTrainingModules() {
      try {
        await loadTrainingModules();
      } catch (error) {
        if (!isMounted) return;

        setPageStatus("error");
        setPageError(
          error instanceof Error ? error.message : "Unable to load training modules."
        );
      }
    }

    fetchTrainingModules();

    return () => {
      isMounted = false;
    };
  }, [loadTrainingModules]);

  async function handleArchiveTraining(trainingModule: TrainingModule) {
    setActionStatus("loading");
    setActionMessage("");
    setPageError("");

    try {
      const token = await getAccessToken();
      const response = await fetch(
        `/api/training/${encodeURIComponent(trainingModule.id)}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: "archived" }),
        }
      );
      const responseData = (await response.json().catch(() => null)) as
        | { module?: TrainingModule }
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          getReadableErrorMessage(responseData, "Unable to archive the training.")
        );
      }

      setActionStatus("success");
      setActionMessage(`Archived "${trainingModule.title}".`);
      await loadTrainingModules(false);
    } catch (error) {
      setActionStatus("error");
      setActionMessage(
        error instanceof Error ? error.message : "Unable to archive the training."
      );
    }
  }

  function handleDeleteTrainingClick(trainingModule: TrainingModule) {
    setActionMessage("");

    if (trainingModule.status !== "draft") {
      setActionStatus("error");
      setActionMessage(
        "Published trainings cannot be deleted. Archive this training instead."
      );
      return;
    }

    setDeleteTarget(trainingModule);
  }

  async function handleConfirmDeleteTraining() {
    if (!deleteTarget) return;

    const trainingModule = deleteTarget;

    setActionStatus("loading");
    setActionMessage("");
    setPageError("");

    try {
      const token = await getAccessToken();
      const response = await fetch(
        `/api/training/${encodeURIComponent(trainingModule.id)}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      const responseData = (await response.json().catch(() => null)) as
        | { success?: boolean }
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          getReadableErrorMessage(responseData, "Unable to delete the training.")
        );
      }

      setDeleteTarget(null);
      setActionStatus("success");
      setActionMessage(`Deleted "${trainingModule.title}".`);
      await loadTrainingModules(false);
    } catch (error) {
      setActionStatus("error");
      setActionMessage(
        error instanceof Error ? error.message : "Unable to delete the training."
      );
    }
  }

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

      {actionMessage && (
        <div
          className={`mb-6 rounded-lg border px-4 py-3 text-sm font-medium ${
            actionStatus === "success"
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {actionMessage}
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
              trainingModules.map((trainingModule) => (
                <tr
                  key={trainingModule.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <td className="px-6 py-4">
                    <p className="font-medium text-slate-900">
                      {trainingModule.title}
                    </p>
                  </td>

                  <td className="px-6 py-4 text-sm text-slate-600">
                    {trainingModule.category || "Uncategorized"}
                  </td>

                  <td className="px-6 py-4 text-sm text-slate-600">
                    {formatAudience(trainingModule.training_audience)}
                  </td>

                  <td className="px-6 py-4 text-sm text-slate-600">
                    {trainingModule.estimated_minutes === null
                      ? "Not set"
                      : `${trainingModule.estimated_minutes} min`}
                  </td>

                  <td className="px-6 py-4 text-sm text-slate-600">
                    {trainingModule.days_allowed === null
                      ? "Not set"
                      : `${trainingModule.days_allowed} days`}
                  </td>

                  <td className="px-6 py-4">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        trainingModule.status === "published"
                          ? "bg-green-100 text-green-700"
                          : trainingModule.status === "archived"
                            ? "bg-slate-100 text-slate-600"
                          : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {formatStatus(trainingModule.status)}
                    </span>
                  </td>

                  <td className="px-6 py-4 text-sm text-slate-600">
                    {formatUpdatedDate(trainingModule.updated_at)}
                  </td>

                  <td className="px-6 py-4">
                    <div className="flex flex-wrap justify-end gap-2">
                      <a
                        href={`/training/new?id=${trainingModule.id}`}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white"
                      >
                        Edit
                      </a>
                      {trainingModule.status !== "archived" && (
                        <button
                          type="button"
                          disabled={actionStatus === "loading"}
                          onClick={() => handleArchiveTraining(trainingModule)}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Archive
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={actionStatus === "loading"}
                        onClick={() => handleDeleteTrainingClick(trainingModule)}
                        className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900">
              Delete this training?
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              This will remove its slides, quiz questions, assignments, progress, and
              quiz attempts.
            </p>
            <p className="mt-3 break-words text-sm font-semibold text-slate-900">
              {deleteTarget.title}
            </p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={actionStatus === "loading"}
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionStatus === "loading"}
                onClick={handleConfirmDeleteTraining}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {actionStatus === "loading" ? "Deleting..." : "Delete Training"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
