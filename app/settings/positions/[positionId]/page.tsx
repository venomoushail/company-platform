"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Location, Position, Profile, TrainingAssignment } from "@/types/supabase";

type PositionMetrics = {
  total_employees: number;
  active_employees: number;
  assigned_trainings: number;
  completed_trainings: number;
  completion_rate: number;
  average_latest_score: number | null;
  failed_count: number;
  past_due_count: number;
};

type PositionEmployee = Pick<
  Profile,
  | "id"
  | "full_name"
  | "preferred_name"
  | "email"
  | "employee_number"
  | "role"
  | "is_active"
> & {
  location: Location | null;
  latest_training_status: TrainingAssignment["status"] | null;
  latest_training_title: string | null;
};

type PositionTraining = {
  module_id: string;
  title: string;
  status: string;
  assigned_count: number;
  completed_count: number;
  failed_count: number;
  average_score: number | null;
  past_due_count: number;
};

type PositionDetailResponse = {
  position: Position;
  metrics: PositionMetrics;
  employees: PositionEmployee[];
  trainings: PositionTraining[];
};

function getReadableErrorMessage(data: unknown, fallback: string) {
  if (!data || typeof data !== "object") return fallback;

  const error = (data as { error?: unknown }).error;

  return typeof error === "string" && error.trim() ? error : fallback;
}

async function getAuthHeaders() {
  const supabase = createBrowserSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase environment variables are not configured.");
  }

  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session?.access_token) {
    throw new Error(error?.message || "Sign in before viewing positions.");
  }

  return {
    Authorization: `Bearer ${data.session.access_token}`,
  };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatScore(value: number | null) {
  return value === null ? "No scores" : `${value}%`;
}

function formatStatus(status: TrainingAssignment["status"] | null) {
  if (!status) return "No training";

  return status.replaceAll("_", " ");
}

function statusBadgeClass(status: TrainingAssignment["status"] | null) {
  if (status === "completed") return "bg-green-100 text-green-700";
  if (status === "failed") return "bg-red-100 text-red-700";
  if (status === "in_progress") return "bg-blue-100 text-blue-700";

  return "bg-slate-100 text-slate-600";
}

function formatLocation(location: Location | null) {
  if (!location) return "Not assigned";

  return `Store ${location.store_number} - ${location.name}`;
}

export default function PositionDetailPage() {
  const params = useParams<{ positionId: string }>();
  const positionId = params.positionId;
  const [detail, setDetail] = useState<PositionDetailResponse | null>(null);
  const [isFetching, setIsFetching] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const fetchPositionDetail = useCallback(async () => {
    setIsFetching(true);
    setPageError(null);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch(
        `/api/positions/${encodeURIComponent(positionId)}`,
        { headers }
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          getReadableErrorMessage(data, "Unable to load position details.")
        );
      }

      setDetail(data as PositionDetailResponse);
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "Unable to load position details."
      );
    } finally {
      setIsFetching(false);
    }
  }, [positionId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      fetchPositionDetail();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [fetchPositionDetail]);

  return (
    <AdminLayout
      title={detail ? detail.position.name : "Position Details"}
      description={
        detail
          ? `${detail.position.name} operational view`
          : "Review job position employees and training activity."
      }
    >
      <div className="space-y-6">
        <Link
          href="/settings?tab=positions"
          className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Back to Positions
        </Link>

        {pageError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {pageError}
          </div>
        )}

        {isFetching ? (
          <section className="rounded-xl bg-white px-6 py-12 text-center shadow-sm">
            <p className="font-semibold text-slate-900">Loading position</p>
            <p className="mt-2 text-sm text-slate-500">
              Fetching position metrics and activity.
            </p>
          </section>
        ) : detail ? (
          <>
            <PositionInfo position={detail.position} />
            <MetricGrid metrics={detail.metrics} />
            <EmployeeSection employees={detail.employees} />
            <TrainingSection trainings={detail.trainings} />
          </>
        ) : null}
      </div>
    </AdminLayout>
  );
}

function PositionInfo({ position }: { position: Position }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="grid gap-5 md:grid-cols-3">
        <InfoItem label="Position Name" value={position.name} />
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Status
          </p>
          <span
            className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
              position.is_active
                ? "bg-green-100 text-green-700"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {position.is_active ? "Active" : "Inactive"}
          </span>
        </div>
        <InfoItem label="Created" value={formatDate(position.created_at)} />
      </div>
    </section>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function MetricGrid({ metrics }: { metrics: PositionMetrics }) {
  const cards = [
    ["Total Employees", metrics.total_employees],
    ["Active Employees", metrics.active_employees],
    ["Assigned Trainings", metrics.assigned_trainings],
    ["Completed Trainings", metrics.completed_trainings],
    ["Completion Rate", `${metrics.completion_rate}%`],
    ["Average Score", formatScore(metrics.average_latest_score)],
    ["Failed", metrics.failed_count],
    ["Past Due", metrics.past_due_count],
  ];

  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(([label, value]) => (
        <div
          key={label}
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {label}
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
        </div>
      ))}
    </section>
  );
}

function EmployeeSection({ employees }: { employees: PositionEmployee[] }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-6">
        <h2 className="text-lg font-bold text-slate-900">Employees</h2>
        <p className="mt-1 text-sm text-slate-500">
          Employees assigned to this position within your allowed location scope.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Email</th>
              <th className="px-5 py-3">Employee #</th>
              <th className="px-5 py-3">Location</th>
              <th className="px-5 py-3">Role</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Latest Training</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {employees.map((employee) => (
              <tr key={employee.id} className="hover:bg-slate-50">
                <td className="px-5 py-4 font-semibold text-slate-900">
                  {employee.preferred_name || employee.full_name}
                </td>
                <td className="px-5 py-4 text-slate-700">{employee.email}</td>
                <td className="px-5 py-4 text-slate-700">
                  {employee.employee_number}
                </td>
                <td className="px-5 py-4 text-slate-700">
                  {formatLocation(employee.location)}
                </td>
                <td className="px-5 py-4 capitalize text-slate-700">
                  {employee.role}
                </td>
                <td className="px-5 py-4">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                      employee.is_active
                        ? "bg-green-100 text-green-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {employee.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusBadgeClass(
                      employee.latest_training_status
                    )}`}
                    title={employee.latest_training_title ?? undefined}
                  >
                    {formatStatus(employee.latest_training_status)}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <div className="flex justify-end gap-2">
                    <Link
                      href={`/employees?employeeId=${encodeURIComponent(employee.id)}`}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      View
                    </Link>
                    <Link
                      href={`/employees?employeeId=${encodeURIComponent(employee.id)}&edit=1`}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Edit
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {employees.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-5 py-10 text-center text-sm font-medium text-slate-500"
                >
                  No employees are assigned to this position in your allowed scope.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TrainingSection({ trainings }: { trainings: PositionTraining[] }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-6">
        <h2 className="text-lg font-bold text-slate-900">Training Activity</h2>
        <p className="mt-1 text-sm text-slate-500">
          Trainings targeted to this position and scoped assignment results.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3">Training</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Assigned</th>
              <th className="px-5 py-3">Completed</th>
              <th className="px-5 py-3">Failed</th>
              <th className="px-5 py-3">Average Score</th>
              <th className="px-5 py-3">Past Due</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {trainings.map((training) => (
              <tr key={training.module_id} className="hover:bg-slate-50">
                <td className="px-5 py-4 font-semibold text-slate-900">
                  {training.title}
                </td>
                <td className="px-5 py-4 capitalize text-slate-700">
                  {training.status}
                </td>
                <td className="px-5 py-4 text-slate-700">
                  {training.assigned_count}
                </td>
                <td className="px-5 py-4 text-slate-700">
                  {training.completed_count}
                </td>
                <td className="px-5 py-4 text-slate-700">
                  {training.failed_count}
                </td>
                <td className="px-5 py-4 text-slate-700">
                  {formatScore(training.average_score)}
                </td>
                <td className="px-5 py-4 text-slate-700">
                  {training.past_due_count}
                </td>
              </tr>
            ))}
            {trainings.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-5 py-10 text-center text-sm font-medium text-slate-500"
                >
                  No trainings target this position.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
