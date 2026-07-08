"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import EmployeeLayout from "@/components/layout/EmployeeLayout";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Company, Profile, TrainingModule } from "@/types/supabase";

type EmployeeCompany = Pick<
  Company,
  | "id"
  | "name"
  | "primary_color"
  | "secondary_color"
  | "accent_color"
  | "logo_url"
  | "favicon_url"
>;

type TrainingStatus = {
  module_id: string;
  status:
    | "not_started"
    | "in_progress"
    | "lesson_complete_quiz_required"
    | "completed"
    | "failed_retake_available"
    | "failed";
  progress_percent: number;
  lesson_completed: boolean;
  has_quiz: boolean;
  latest_score: number | null;
  latest_passed: boolean | null;
  attempt_count: number;
  can_retake: boolean;
  assigned_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  action_label:
    | "Start Training"
    | "Continue Training"
    | "Start Quiz"
    | "Retake Quiz"
    | "Review Training";
};

type EmployeeTrainingResponse = {
  profile: Profile;
  company: EmployeeCompany | null;
  modules: TrainingModule[];
  statuses: Record<string, TrainingStatus>;
};

type PageStatus = "loading" | "success" | "error";

function getReadableErrorMessage(data: unknown, fallback: string) {
  if (!data || typeof data !== "object") return fallback;

  const error = (data as { error?: unknown }).error;
  return typeof error === "string" ? error : fallback;
}

function formatMinutes(value: number | null) {
  return value === null ? "Time not set" : `${value} min`;
}

function getStatusLabel(status: TrainingStatus | undefined) {
  if (!status) return "Not Started";

  if (status.status === "in_progress") return "In Progress";
  if (status.status === "lesson_complete_quiz_required") {
    return "Lesson Complete / Quiz Required";
  }
  if (status.status === "completed") return "Completed";
  if (status.status === "failed_retake_available") {
    return "Failed / Retake Available";
  }
  if (status.status === "failed") return "Failed";

  return "Not Started";
}

function getStatusClass(status: TrainingStatus | undefined) {
  if (!status || status.status === "not_started") {
    return "bg-slate-100 text-slate-600";
  }

  if (status.status === "completed") {
    return "bg-green-100 text-green-700";
  }

  if (status.status === "failed" || status.status === "failed_retake_available") {
    return "bg-red-100 text-red-700";
  }

  return "bg-blue-100 text-blue-700";
}

function isCompletedTraining(status: TrainingStatus | undefined) {
  return status?.status === "completed" && status.latest_passed === true;
}

function isActiveTraining(status: TrainingStatus | undefined) {
  if (!status) return true;

  return (
    status.status === "not_started" ||
    status.status === "in_progress" ||
    status.status === "lesson_complete_quiz_required" ||
    status.status === "failed_retake_available"
  );
}

function getGreetingPeriod() {
  const hour = new Date().getHours();

  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";

  return "Good Evening";
}

function getGreetingName(profile: Profile | null) {
  return profile?.preferred_name?.trim() || profile?.first_name?.trim() || "there";
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function isOverdueTraining(module: TrainingModule, status: TrainingStatus | undefined) {
  if (!status?.assigned_at || !module.days_allowed || status.status === "completed") {
    return false;
  }

  const dueDate = new Date(status.assigned_at);
  dueDate.setDate(dueDate.getDate() + module.days_allowed);

  return dueDate < new Date();
}

function getEmployeeWelcomeMessage(
  modules: TrainingModule[],
  statuses: Record<string, TrainingStatus>
) {
  const overdueCount = modules.filter((module) =>
    isOverdueTraining(module, statuses[module.id])
  ).length;
  const activeCount = modules.filter((module) =>
    isActiveTraining(statuses[module.id])
  ).length;

  if (overdueCount > 0) {
    return `You have ${pluralize(
      overdueCount,
      "overdue training",
      "overdue trainings"
    )} that needs your attention.`;
  }

  if (activeCount > 0) {
    return `Welcome back! You have ${pluralize(
      activeCount,
      "training course"
    )} ready to complete.`;
  }

  return "You're all caught up! Great job staying current with your training.";
}

function EmployeeDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [company, setCompany] = useState<EmployeeCompany | null>(null);
  const [modules, setModules] = useState<TrainingModule[]>([]);
  const [statuses, setStatuses] = useState<Record<string, TrainingStatus>>({});
  const [pageStatus, setPageStatus] = useState<PageStatus>("loading");
  const [pageError, setPageError] = useState("");
  const showCompletedOnly = searchParams.get("status") === "completed";
  const showAccount = searchParams.get("panel") === "account";

  useEffect(() => {
    let isMounted = true;

    async function loadAssignedTrainings() {
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
        router.replace("/login?next=%2Femployee%2Fdashboard");
        return;
      }

      const response = await fetch("/api/employee/training", {
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
        },
      });
      const responseData = (await response.json().catch(() => null)) as
        | EmployeeTrainingResponse
        | { error?: string }
        | null;

      if (!isMounted) return;

      if (!response.ok) {
        setPageStatus("error");
        setPageError(
          getReadableErrorMessage(responseData, "Unable to load your trainings.")
        );
        return;
      }

      const trainingData = responseData as EmployeeTrainingResponse;

      setProfile(trainingData.profile);
      setCompany(trainingData.company);
      setModules(trainingData.modules);
      setStatuses(trainingData.statuses ?? {});
      setPageStatus("success");
    }

    loadAssignedTrainings();

    return () => {
      isMounted = false;
    };
  }, [router]);

  const visibleModules = showCompletedOnly
    ? modules.filter((module) => isCompletedTraining(statuses[module.id]))
    : modules.filter((module) => isActiveTraining(statuses[module.id]));
  const greetingMessage =
    pageStatus === "loading"
      ? "Loading your assigned training courses."
      : getEmployeeWelcomeMessage(modules, statuses);

  return (
    <EmployeeLayout
      company={company}
      profile={profile}
      title={showAccount ? "Account" : showCompletedOnly ? "Completed" : "My Trainings"}
      description={
        showAccount
          ? "Your employee training profile."
          : "Assigned company training modules and quiz status."
      }
    >
      {pageStatus === "loading" ? (
        <section className="rounded-xl bg-white p-8 shadow-sm">
          <p className="font-semibold text-slate-900">Loading trainings</p>
          <p className="mt-2 text-sm text-slate-500">
            Fetching your assigned modules from Supabase.
          </p>
        </section>
      ) : pageStatus === "error" ? (
        <section className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm font-medium text-red-700">
          {pageError}
        </section>
      ) : showAccount ? (
        <>
          <DashboardGreeting
            name={getGreetingName(profile)}
            message={greetingMessage}
          />
          <section className="rounded-xl bg-white p-6 shadow-sm">
            <dl className="grid gap-5 md:grid-cols-2">
              <div>
                <dt className="text-sm font-semibold text-slate-500">Name</dt>
                <dd className="mt-1 font-medium text-slate-900">
                  {profile?.full_name || "Not set"}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-slate-500">Email</dt>
                <dd className="mt-1 font-medium text-slate-900">
                  {profile?.email || "Not set"}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-slate-500">
                  Employee Number
                </dt>
                <dd className="mt-1 font-medium text-slate-900">
                  {profile?.employee_number || "Not set"}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-slate-500">Company</dt>
                <dd className="mt-1 font-medium text-slate-900">
                  {company?.name || "Not set"}
                </dd>
              </div>
            </dl>
          </section>
        </>
      ) : visibleModules.length === 0 ? (
        <>
          <DashboardGreeting
            name={getGreetingName(profile)}
            message={greetingMessage}
          />
          <section className="rounded-xl bg-white p-8 text-center shadow-sm">
            <p className="font-semibold text-slate-900">
              {showCompletedOnly
                ? "No completed trainings yet"
                : "You're all caught up."}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              {showCompletedOnly
                ? "Completed trainings will appear here after you pass them."
                : "Completed trainings are available in the Completed tab."}
            </p>
          </section>
        </>
      ) : (
        <>
          <DashboardGreeting
            name={getGreetingName(profile)}
            message={greetingMessage}
          />
          <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {visibleModules.map((module) => {
              const status = statuses[module.id];

              return (
                <article
                  key={module.id}
                  className="flex min-h-72 flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                        {module.category || "General"}
                      </p>
                      <h2 className="mt-2 text-xl font-bold text-slate-900">
                        {module.title}
                      </h2>
                    </div>

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClass(
                        status
                      )}`}
                    >
                      {getStatusLabel(status)}
                    </span>
                  </div>

                  <p className="mt-4 line-clamp-4 text-sm leading-6 text-slate-600">
                    {module.description || "No description provided."}
                  </p>

                  <div className="mt-auto pt-6">
                    <div className="mb-3 flex items-center justify-between border-t border-slate-200 pt-4 text-sm text-slate-500">
                      <span>{formatMinutes(module.estimated_minutes)}</span>
                      <span>{status?.progress_percent ?? 0}% complete</span>
                    </div>

                    <div className="mb-4 h-2 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-blue-600"
                        style={{ width: `${status?.progress_percent ?? 0}%` }}
                      />
                    </div>

                    {status?.latest_score !== null && status?.latest_score !== undefined && (
                      <p className="mb-4 text-sm font-medium text-slate-600">
                        Latest score: {status.latest_score}%
                      </p>
                    )}

                    <Link
                      href={`/employee/training/${module.id}`}
                      className="block rounded-lg bg-blue-600 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      {status?.action_label || "Start Training"}
                    </Link>
                  </div>
                </article>
              );
            })}
          </section>
        </>
      )}
    </EmployeeLayout>
  );
}

function DashboardGreeting({ name, message }: { name: string; message: string }) {
  return (
    <section className="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-wide text-[var(--company-accent)]">
        Dashboard
      </p>
      <h1 className="mt-3 text-4xl font-bold text-slate-900 md:text-5xl">
        {getGreetingPeriod()}, {name}! 👋
      </h1>
      <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
        {message}
      </p>
    </section>
  );
}

export default function EmployeeDashboardPage() {
  return (
    <Suspense fallback={null}>
      <EmployeeDashboardContent />
    </Suspense>
  );
}
