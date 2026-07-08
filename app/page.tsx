"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminLayout from "@/components/layout/AdminLayout";
import StatCard from "@/components/dashboard/StatCard";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { TrainingAssignment } from "@/types/supabase";

type DashboardMetrics = {
  employees: number;
  trainingModules: number;
  completionRate: number;
  averageScore: number | null;
  pastDue: number;
  totalAssignments: number;
  completedAssignments: number;
};

type DashboardActivity = {
  assignment: TrainingAssignment;
  employeeName: string;
  moduleTitle: string;
};

type DashboardResponse = {
  metrics: DashboardMetrics;
  recentCompletions: DashboardActivity[];
  needsAttention: DashboardActivity[];
  dueDateSupport: boolean;
};

type PageStatus = "loading" | "success" | "error";
type AuthDebugResult = {
  client: {
    getSessionErrorMessage: string;
    sessionExists: boolean;
    accessTokenLength: number;
    userEmail: string;
    fetchWillSendAuthorizationHeader: boolean;
  };
  server?: unknown;
  error?: string;
};

const emptyMetrics: DashboardMetrics = {
  employees: 0,
  trainingModules: 0,
  completionRate: 0,
  averageScore: null,
  pastDue: 0,
  totalAssignments: 0,
  completedAssignments: 0,
};

function getReadableErrorMessage(data: unknown, fallback: string) {
  if (!data || typeof data !== "object") return fallback;

  const error = (data as { error?: unknown }).error;
  return typeof error === "string" ? error : fallback;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en").format(value);
}

function formatPercent(value: number) {
  return `${formatNumber(value)}%`;
}

function formatDate(value: string | null) {
  if (!value) return "Not set";

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatScore(value: number | null) {
  return value === null ? "No score" : `${formatNumber(value)}%`;
}

function ActivityList({
  title,
  emptyMessage,
  items,
  tone = "default",
}: {
  title: string;
  emptyMessage: string;
  items: DashboardActivity[];
  tone?: "default" | "attention";
}) {
  return (
    <section className="rounded-xl bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>

      {items.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">{emptyMessage}</p>
      ) : (
        <div className="mt-4 space-y-4">
          {items.map((item) => (
            <div
              key={item.assignment.id}
              className="rounded-lg border border-slate-200 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-900">
                    {item.employeeName}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {item.moduleTitle}
                  </p>
                </div>

                <span
                  className={
                    tone === "attention"
                      ? "rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700"
                      : "rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700"
                  }
                >
                  {formatScore(item.assignment.latest_score)}
                </span>
              </div>

              <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-400">
                {tone === "attention" ? "Failed" : "Completed"}{" "}
                {formatDate(item.assignment.completed_at)}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function Home() {
  const router = useRouter();
  const [dashboardData, setDashboardData] = useState<DashboardResponse | null>(
    null
  );
  const [pageStatus, setPageStatus] = useState<PageStatus>("loading");
  const [pageError, setPageError] = useState("");
  const [authDebugResult, setAuthDebugResult] = useState<AuthDebugResult | null>(
    null
  );
  const [authDebugStatus, setAuthDebugStatus] = useState<PageStatus>("success");

  useEffect(() => {
    let isMounted = true;

    async function loadDashboard() {
      const supabase = createBrowserSupabaseClient();

      if (!supabase) {
        if (!isMounted) return;

        setPageStatus("error");
        setPageError("Supabase environment variables are not configured.");
        return;
      }

      const { data, error } = await supabase.auth.getSession();

      if (!isMounted) return;

      // TODO remove after Vercel auth debugging.
      console.info("[dashboard-auth-debug] client session", {
        getSessionErrorMessage: error?.message ?? "",
        sessionExists: Boolean(data.session),
        accessTokenLength: data.session?.access_token.length ?? 0,
        userEmail: data.session?.user.email ?? "",
        fetchWillSendAuthorizationHeader: Boolean(data.session?.access_token),
      });

      if (error || !data.session?.access_token) {
        setPageStatus("error");
        setPageError(error?.message || "Sign in to view the dashboard.");
        router.replace("/login?next=%2F");
        return;
      }

      const response = await fetch("/api/dashboard", {
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
        },
      });
      const responseData = (await response.json().catch(() => null)) as
        | DashboardResponse
        | { error?: string }
        | null;

      if (!isMounted) return;

      if (!response.ok) {
        setPageStatus("error");
        setPageError(
          getReadableErrorMessage(responseData, "Unable to load dashboard data.")
        );
        return;
      }

      setDashboardData(responseData as DashboardResponse);
      setPageStatus("success");
    }

    loadDashboard();

    return () => {
      isMounted = false;
    };
  }, [router]);

  async function handleRunAuthDebug() {
    setAuthDebugStatus("loading");
    setAuthDebugResult(null);

    const supabase = createBrowserSupabaseClient();

    if (!supabase) {
      setAuthDebugStatus("error");
      setAuthDebugResult({
        client: {
          getSessionErrorMessage: "Supabase environment variables are not configured.",
          sessionExists: false,
          accessTokenLength: 0,
          userEmail: "",
          fetchWillSendAuthorizationHeader: false,
        },
        error: "Supabase environment variables are not configured.",
      });
      return;
    }

    const { data, error } = await supabase.auth.getSession();
    const token = data.session?.access_token ?? "";

    // TODO remove after Vercel auth debugging.
    console.info("[dashboard-auth-debug] run button session", {
      getSessionErrorMessage: error?.message ?? "",
      sessionExists: Boolean(data.session),
      accessTokenLength: token.length,
      userEmail: data.session?.user.email ?? "",
      fetchWillSendAuthorizationHeader: Boolean(token),
    });

    const clientDebug = {
      getSessionErrorMessage: error?.message ?? "",
      sessionExists: Boolean(data.session),
      accessTokenLength: token.length,
      userEmail: data.session?.user.email ?? "",
      fetchWillSendAuthorizationHeader: Boolean(token),
    };

    try {
      const response = await fetch("/api/debug-auth", {
        headers: token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : {},
      });
      const serverDebug = (await response.json().catch(() => null)) as unknown;

      setAuthDebugStatus(response.ok ? "success" : "error");
      setAuthDebugResult({
        client: clientDebug,
        server: serverDebug,
        error: response.ok ? undefined : "Debug endpoint returned an error.",
      });
    } catch (debugError) {
      setAuthDebugStatus("error");
      setAuthDebugResult({
        client: clientDebug,
        error:
          debugError instanceof Error
            ? debugError.message
            : "Unable to run auth debug.",
      });
    }
  }

  const metrics = dashboardData?.metrics ?? emptyMetrics;
  const recentCompletions = dashboardData?.recentCompletions ?? [];
  const needsAttention = dashboardData?.needsAttention ?? [];

  return (
    <AdminLayout
      title="Dashboard"
      description="Overview of employee training activity and completion."
    >
      <div className="space-y-6">
        {pageStatus === "error" && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {pageError}
          </div>
        )}

        {/* TODO remove after Vercel auth debugging. */}
        <section className="rounded-xl bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Auth Diagnostics
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Temporary Vercel session diagnostics.
              </p>
            </div>
            <button
              type="button"
              onClick={handleRunAuthDebug}
              disabled={authDebugStatus === "loading"}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {authDebugStatus === "loading" ? "Running..." : "Run Auth Debug"}
            </button>
          </div>
          {authDebugResult && (
            <pre className="mt-4 max-h-96 overflow-auto rounded-lg border border-slate-200 bg-slate-950 p-4 text-xs leading-5 text-slate-100">
              {JSON.stringify(authDebugResult, null, 2)}
            </pre>
          )}
        </section>

        {pageStatus !== "error" && (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-5">
            <StatCard
              title="Employees"
              value={
                pageStatus === "loading"
                  ? "Loading"
                  : formatNumber(metrics.employees)
              }
            />
            <StatCard
              title="Training Modules"
              value={
                pageStatus === "loading"
                  ? "Loading"
                  : formatNumber(metrics.trainingModules)
              }
            />
            <StatCard
              title="Completion Rate"
              value={
                pageStatus === "loading"
                  ? "Loading"
                  : formatPercent(metrics.completionRate)
              }
            />
            <StatCard
              title="Average Score"
              value={
                pageStatus === "loading"
                  ? "Loading"
                  : metrics.averageScore === null
                    ? "No data"
                    : formatPercent(metrics.averageScore)
              }
            />
            <StatCard
              title="Past Due"
              value={
                pageStatus === "loading" ? "Loading" : formatNumber(metrics.pastDue)
              }
              valueColor={metrics.pastDue > 0 ? "text-red-600" : "text-slate-900"}
            />
          </div>
        )}

        {pageStatus === "success" && (
          <>
            <section className="rounded-xl bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Assignment Summary
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {formatNumber(metrics.completedAssignments)} of{" "}
                    {formatNumber(metrics.totalAssignments)} assignments completed
                    and passed.
                  </p>
                </div>

                {!dashboardData?.dueDateSupport && (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    Due dates not configured
                  </span>
                )}
              </div>
            </section>

            <div className="grid gap-6 lg:grid-cols-2">
              <ActivityList
                title="Recent Completed Trainings"
                emptyMessage="No completed trainings yet."
                items={recentCompletions}
              />
              <ActivityList
                title="Needs Attention"
                emptyMessage="No failed assignments right now."
                items={needsAttention}
                tone="attention"
              />
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
