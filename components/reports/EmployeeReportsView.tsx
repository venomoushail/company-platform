"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { formatCategoryLabel } from "@/lib/training/formatCategoryLabel";
import type {
  Location,
  Position,
  Profile,
  TrainingAssignment,
  TrainingModule,
} from "@/types/supabase";
import type {
  EmployeeReportSummary,
  EmployeeTrainingStatus,
} from "@/lib/reports/employeeTrainingReport";

type EmployeeListItem = {
  employee: Profile;
  location: Location | null;
  positions: Position[];
  summary: EmployeeReportSummary;
};

type EmployeeListResponse = {
  employees: EmployeeListItem[];
  locations: Location[];
  positions: Position[];
};

type TrainingReportRow = {
  assignment: TrainingAssignment;
  module: TrainingModule | null;
  status: EmployeeTrainingStatus;
  isPastDue: boolean;
  isFailed: boolean;
  latestScore: number | null;
  bestScore: number | null;
  passed: boolean | null;
  attemptCount: number;
  expirationDate: string | null;
  trainingDurationSeconds: number | null;
  isGraded: boolean;
  attempts: {
    id: string;
    attemptNumber: number;
    score: number | null;
    passed: boolean | null;
    startedAt: string | null;
    completedAt: string | null;
    durationSeconds: number | null;
  }[];
  assignedByName: string | null;
  assignmentSource: string;
};

type EmployeeDetailResponse = {
  employee: Profile;
  location: Location | null;
  positions: Position[];
  summary: EmployeeReportSummary;
  trainings: TrainingReportRow[];
  permissions: { canEditEmployee: boolean };
};

type LoadStatus = "idle" | "loading" | "success" | "error";
type TrainingSort = "due_date" | "status" | "progress" | "score" | "title";

const controlClass =
  "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-600";

function formatDate(value: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatLocation(location: Location | null) {
  return location ? `Store ${location.store_number} - ${location.name}` : "Not assigned";
}

function formatPercent(value: number | null) {
  return value === null ? "No score" : `${value}%`;
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return "Not available";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  if (hours > 0) return `${hours} hr${minutes > 0 ? ` ${minutes} min` : ""}`;
  if (minutes > 0) return `${minutes} min${remainingSeconds > 0 ? ` ${remainingSeconds} sec` : ""}`;
  return `${remainingSeconds} sec`;
}

function formatTrainingDuration(seconds: number | null) {
  if (seconds === null) return "Not available";
  if (seconds < 60) return "Less than 1 minute";

  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) {
    return `${days} ${days === 1 ? "day" : "days"}${hours > 0 ? ` ${hours} hr` : ""}`;
  }
  if (hours > 0) return `${hours} hr${minutes > 0 ? ` ${minutes} min` : ""}`;
  return `${minutes} min`;
}

function formatQuizDuration(seconds: number | null) {
  if (seconds === null) return "Not available";
  if (seconds === 0) return "Less than 1 minute";
  return formatDuration(seconds);
}

function formatStatus(status: EmployeeTrainingStatus) {
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function statusClass(status: EmployeeTrainingStatus) {
  if (status === "completed") return "bg-green-100 text-green-700";
  if (status === "failed") return "bg-red-100 text-red-700";
  if (status === "past_due" || status === "expired") {
    return "bg-amber-100 text-amber-800";
  }
  if (status === "in_progress") return "bg-blue-100 text-blue-700";
  return "bg-slate-100 text-slate-600";
}

function getErrorMessage(data: unknown, fallback: string) {
  if (!data || typeof data !== "object") return fallback;
  const error = (data as { error?: unknown }).error;
  return typeof error === "string" ? error : fallback;
}

async function getAccessToken() {
  const supabase = createBrowserSupabaseClient();
  if (!supabase) throw new Error("Supabase environment variables are not configured.");
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error(error?.message || "Sign in to view employee reports.");
  }
  return data.session.access_token;
}

function SummaryCard({ label, value, warning }: { label: string; value: string | number; warning?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${warning ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${warning ? "text-amber-800" : "text-slate-900"}`}>
        {value}
      </p>
    </div>
  );
}

function DetailItem({
  label,
  value,
  isMissing = false,
  valueClassName = "",
  className = "",
}: {
  label: string;
  value: string;
  isMissing?: boolean;
  valueClassName?: string;
  className?: string;
}) {
  return (
    <p className={`leading-6 ${className}`}>
      <span className="font-semibold text-slate-600">
        {label}:
      </span>{" "}
      <span
        className={
          valueClassName ||
          (isMissing
            ? "text-slate-500"
            : "text-slate-900")
        }
      >
        {value}
      </span>
    </p>
  );
}

export default function EmployeeReportsView() {
  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [listStatus, setListStatus] = useState<LoadStatus>("loading");
  const [listError, setListError] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [detail, setDetail] = useState<EmployeeDetailResponse | null>(null);
  const [detailStatus, setDetailStatus] = useState<LoadStatus>("idle");
  const [detailError, setDetailError] = useState("");
  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState("all");
  const [positionFilter, setPositionFilter] = useState("all");
  const [activityFilter, setActivityFilter] = useState("active");
  const [employeeSort, setEmployeeSort] = useState("name");
  const [trainingSort, setTrainingSort] = useState<TrainingSort>("due_date");
  const [expandedAssignmentIds, setExpandedAssignmentIds] = useState<Set<string>>(
    () => new Set()
  );

  useEffect(() => {
    let mounted = true;
    async function loadEmployees() {
      try {
        const token = await getAccessToken();
        const response = await fetch("/api/reports/employees", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await response.json().catch(() => null)) as
          | EmployeeListResponse
          | { error?: string }
          | null;
        if (!mounted) return;
        if (!response.ok) throw new Error(getErrorMessage(data, "Unable to load employees."));
        const report = data as EmployeeListResponse;
        setEmployees(report.employees);
        setLocations(report.locations);
        setPositions(report.positions);
        setListStatus("success");
      } catch (error) {
        if (!mounted) return;
        setListError(error instanceof Error ? error.message : "Unable to load employees.");
        setListStatus("error");
      }
    }
    loadEmployees();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedEmployeeId) return;

    let mounted = true;
    async function loadDetail() {
      setDetailStatus("loading");
      setDetailError("");
      try {
        const token = await getAccessToken();
        const response = await fetch(
          `/api/reports/employees/${encodeURIComponent(selectedEmployeeId)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = (await response.json().catch(() => null)) as
          | EmployeeDetailResponse
          | { error?: string }
          | null;
        if (!mounted) return;
        if (!response.ok) {
          throw new Error(getErrorMessage(data, "Unable to load this employee report."));
        }
        setDetail(data as EmployeeDetailResponse);
        setDetailStatus("success");
      } catch (error) {
        if (!mounted) return;
        setDetailError(
          error instanceof Error ? error.message : "Unable to load this employee report."
        );
        setDetailStatus("error");
      }
    }
    loadDetail();
    return () => {
      mounted = false;
    };
  }, [selectedEmployeeId]);

  const filteredEmployees = useMemo(() => {
    const query = search.trim().toLowerCase();
    return employees
      .filter((item) => {
        const searchable = [
          item.employee.full_name,
          item.employee.preferred_name,
          item.employee.email,
          item.employee.employee_number,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return (
          (!query || searchable.includes(query)) &&
          (locationFilter === "all" || item.employee.location_id === locationFilter) &&
          (positionFilter === "all" ||
            item.positions.some((position) => position.id === positionFilter)) &&
          (activityFilter === "all" ||
            (activityFilter === "active"
              ? item.employee.is_active
              : !item.employee.is_active))
        );
      })
      .sort((left, right) => {
        if (employeeSort === "completion_rate") {
          return (
            (right.summary.completionRate ?? -1) -
              (left.summary.completionRate ?? -1) ||
            left.employee.full_name.localeCompare(right.employee.full_name)
          );
        }
        if (employeeSort === "overdue_count") {
          return (
            right.summary.pastDue - left.summary.pastDue ||
            left.employee.full_name.localeCompare(right.employee.full_name)
          );
        }
        return left.employee.full_name.localeCompare(right.employee.full_name);
      });
  }, [activityFilter, employeeSort, employees, locationFilter, positionFilter, search]);

  const sortedTrainings = useMemo(() => {
    const rows = [...(detail?.trainings ?? [])];
    return rows.sort((left, right) => {
      if (trainingSort === "title") {
        return (left.module?.title || "Deleted training").localeCompare(
          right.module?.title || "Deleted training"
        );
      }
      if (trainingSort === "status") return left.status.localeCompare(right.status);
      if (trainingSort === "progress") {
        return right.assignment.progress_percent - left.assignment.progress_percent;
      }
      if (trainingSort === "score") return (right.latestScore ?? -1) - (left.latestScore ?? -1);
      const leftTime = left.assignment.due_date
        ? new Date(left.assignment.due_date).getTime()
        : Number.MAX_SAFE_INTEGER;
      const rightTime = right.assignment.due_date
        ? new Date(right.assignment.due_date).getTime()
        : Number.MAX_SAFE_INTEGER;
      return leftTime - rightTime;
    });
  }, [detail?.trainings, trainingSort]);

  function toggleExpanded(assignmentId: string) {
    setExpandedAssignmentIds((current) => {
      const next = new Set(current);
      if (next.has(assignmentId)) next.delete(assignmentId);
      else next.add(assignmentId);
      return next;
    });
  }

  function exportCsv() {
    if (!detail) return;
    const headers = [
      "Employee Name", "Employee Number", "Location", "Position", "Training",
      "Status", "Progress", "Latest Score", "Best Score", "Passed", "Attempts",
      "Assigned Date", "Due Date", "Completed Date",
    ];
    const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = detail.trainings.map((row) => [
      detail.employee.full_name,
      detail.employee.employee_number,
      formatLocation(detail.location),
      detail.positions.map((position) => position.name).join("; "),
      row.module?.title || "Deleted training",
      formatStatus(row.status),
      `${row.assignment.progress_percent}%`,
      row.latestScore ?? "No score",
      row.bestScore ?? "No score",
      row.passed === null ? "Not determined" : row.passed ? "Yes" : "No",
      row.attemptCount,
      row.assignment.assigned_at,
      row.assignment.due_date || "",
      row.assignment.completed_at || "",
    ]);
    const csv = [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${detail.employee.full_name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-training-report.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
      <section className={`${selectedEmployeeId ? "hidden lg:block" : "block"} rounded-xl border border-slate-200 bg-white shadow-sm`}>
        <div className="border-b border-slate-200 p-4">
          <h2 className="font-bold text-slate-900">Employees</h2>
          <p className="mt-1 text-sm text-slate-500">Select an employee to review their training.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, email, or employee #"
              aria-label="Search employees"
              className={controlClass}
            />
            <select value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)} aria-label="Filter by location" className={controlClass}>
              <option value="all">All locations</option>
              {locations.map((location) => <option key={location.id} value={location.id}>{formatLocation(location)}</option>)}
            </select>
            <select value={positionFilter} onChange={(event) => setPositionFilter(event.target.value)} aria-label="Filter by position" className={controlClass}>
              <option value="all">All positions</option>
              {positions.map((position) => <option key={position.id} value={position.id}>{position.name}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <select value={activityFilter} onChange={(event) => setActivityFilter(event.target.value)} aria-label="Filter by activity" className={controlClass}>
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <select value={employeeSort} onChange={(event) => setEmployeeSort(event.target.value)} aria-label="Sort employees" className={controlClass}>
                <option value="name">Name</option>
                <option value="completion_rate">Completion</option>
                <option value="overdue_count">Overdue</option>
              </select>
            </div>
          </div>
        </div>

        <div className="max-h-[760px] overflow-y-auto p-2">
          {listStatus === "loading" ? (
            <p className="px-4 py-10 text-center text-sm font-semibold text-slate-500">Loading employees...</p>
          ) : listStatus === "error" ? (
            <p className="m-2 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{listError}</p>
          ) : filteredEmployees.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-500">No employees match these filters.</p>
          ) : (
            filteredEmployees.map((item) => {
              const selected = selectedEmployeeId === item.employee.id;
              return (
                <button
                  key={item.employee.id}
                  type="button"
                  onClick={() => setSelectedEmployeeId(item.employee.id)}
                  className={`mb-1 w-full rounded-lg p-3 text-left transition ${selected ? "bg-blue-50 ring-1 ring-blue-200" : "hover:bg-slate-50"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">{item.employee.full_name}</p>
                      {item.employee.preferred_name && <p className="text-xs text-slate-500">Preferred: {item.employee.preferred_name}</p>}
                      <p className="mt-1 truncate text-xs text-slate-500">#{item.employee.employee_number} · {formatLocation(item.location)}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold uppercase ${item.employee.is_active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                      {item.employee.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <p className="mt-2 truncate text-xs text-slate-500">{item.positions.map((position) => position.name).join(", ") || "No position"} · {item.employee.role}</p>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-blue-600" style={{ width: `${item.summary.completionRate ?? 0}%` }} />
                    </div>
                    <span className="text-xs font-bold text-slate-600">{item.summary.completionRate === null ? "No assignments" : `${item.summary.completionRate}%`}</span>
                    {item.summary.pastDue > 0 && <span className="text-xs font-bold text-amber-700">{item.summary.pastDue} overdue</span>}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </section>

      <section className={`${selectedEmployeeId ? "block" : "hidden lg:block"} min-w-0`}>
        {selectedEmployeeId && (
          <button type="button" onClick={() => { setSelectedEmployeeId(""); setDetail(null); setDetailStatus("idle"); }} className="mb-3 text-sm font-bold text-blue-700 lg:hidden">
            ← Back to Employees
          </button>
        )}
        {!selectedEmployeeId ? (
          <div className="flex min-h-80 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <div><p className="font-bold text-slate-900">Select an employee</p><p className="mt-2 text-sm text-slate-500">Their training summary and assignment history will appear here.</p></div>
          </div>
        ) : detailStatus === "loading" ? (
          <div className="rounded-xl bg-white p-12 text-center shadow-sm text-sm font-semibold text-slate-500">Loading employee report...</div>
        ) : detailStatus === "error" ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700">{detailError}</div>
        ) : detail ? (
          <div className="space-y-5">
            <header className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-bold text-slate-900">{detail.employee.full_name}</h2>
                    <span className={`rounded-full px-2 py-1 text-xs font-bold ${detail.employee.is_active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"}`}>{detail.employee.is_active ? "Active" : "Inactive"}</span>
                  </div>
                  {detail.employee.preferred_name && <p className="mt-1 text-sm text-slate-500">Preferred name: {detail.employee.preferred_name}</p>}
                  <div className="mt-3 grid gap-x-6 gap-y-1 text-sm text-slate-600 sm:grid-cols-2 xl:grid-cols-3">
                    <p>{detail.employee.email}</p><p>Employee #{detail.employee.employee_number}</p><p>{formatLocation(detail.location)}</p>
                    <p>{detail.positions.map((position) => position.name).join(", ") || "No position assigned"}</p><p className="capitalize">Role: {detail.employee.role}</p><p>{detail.employee.last_login_at ? `Last login ${formatDate(detail.employee.last_login_at)}` : "Never logged in"}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {detail.permissions.canEditEmployee && <a href={`/employees?employeeId=${encodeURIComponent(detail.employee.id)}`} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">View / Edit Employee</a>}
                  <button type="button" onClick={exportCsv} className="rounded-lg border border-blue-600 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50">Export CSV</button>
                </div>
              </div>
            </header>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
              <SummaryCard label="Assigned" value={detail.summary.totalAssigned} />
              <SummaryCard label="Completed" value={detail.summary.completed} />
              <SummaryCard label="In progress" value={detail.summary.inProgress} />
              <SummaryCard label="Not started" value={detail.summary.notStarted} />
              <SummaryCard label="Failed" value={detail.summary.failed} warning={detail.summary.failed > 0} />
              <SummaryCard label="Past due" value={detail.summary.pastDue} warning={detail.summary.pastDue > 0} />
              <SummaryCard label="Completion" value={detail.summary.completionRate === null ? "N/A" : `${detail.summary.completionRate}%`} />
              <SummaryCard label="Avg. score" value={formatPercent(detail.summary.averageLatestScore)} />
            </div>

            <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
                <div><h3 className="font-bold text-slate-900">Assigned Trainings</h3><p className="mt-1 text-sm text-slate-500">Latest progress and complete attempt history.</p></div>
                <select value={trainingSort} onChange={(event) => setTrainingSort(event.target.value as TrainingSort)} aria-label="Sort assigned trainings" className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700">
                  <option value="due_date">Due date</option><option value="status">Status</option><option value="progress">Progress</option><option value="score">Latest score</option><option value="title">Title</option>
                </select>
              </div>
              {sortedTrainings.length === 0 ? (
                <div className="p-10 text-center"><p className="font-semibold text-slate-900">No assigned trainings</p><p className="mt-2 text-sm text-slate-500">This employee does not have any training assignments yet.</p></div>
              ) : (
                <div className="divide-y divide-slate-200">
                  {sortedTrainings.map((row) => {
                    const expanded = expandedAssignmentIds.has(row.assignment.id);
                    return (
                      <div key={row.assignment.id}>
                        <button type="button" onClick={() => toggleExpanded(row.assignment.id)} aria-expanded={expanded} className="grid w-full gap-3 p-4 text-left hover:bg-slate-50 md:grid-cols-[minmax(180px,1.4fr)_110px_120px_100px_90px_24px] md:items-center">
                          <div><p className="font-bold text-slate-900">{row.module?.title || "Deleted training module"}</p><p className="mt-1 text-xs text-slate-500">{formatCategoryLabel(row.module?.category)} · Due {formatDate(row.assignment.due_date)}</p></div>
                          <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-bold ${statusClass(row.status)}`}>{formatStatus(row.status)}</span>
                          <div><div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.min(100, Math.max(0, row.assignment.progress_percent))}%` }} /></div><p className="mt-1 text-xs font-semibold text-slate-500">{row.assignment.progress_percent}%</p></div>
                          <p className="text-sm font-semibold text-slate-700">Latest {row.isGraded ? formatPercent(row.latestScore) : "Not graded"}</p>
                          <p className="text-sm text-slate-600">{row.attemptCount} {row.attemptCount === 1 ? "attempt" : "attempts"}</p>
                          <span className="text-slate-400">{expanded ? "−" : "+"}</span>
                        </button>
                        {expanded && (
                          <div className="border-t border-slate-200 bg-slate-50 p-4 text-slate-900 md:p-5">
                            <div className="grid gap-x-5 gap-y-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                              <DetailItem label="Assigned" value={formatDate(row.assignment.assigned_at)} />
                              <DetailItem label="Due" value={formatDate(row.assignment.due_date)} isMissing={!row.assignment.due_date} />
                              <DetailItem label="Completed" value={formatDate(row.assignment.completed_at)} isMissing={!row.assignment.completed_at} />
                              <DetailItem label="Expires" value={formatDate(row.expirationDate)} isMissing={!row.expirationDate} />
                              <DetailItem label="Passing score" value={row.module ? `${row.module.passing_score}%` : "Unavailable"} isMissing={!row.module} />
                              <DetailItem label="Best score" value={row.isGraded ? formatPercent(row.bestScore) : "Not graded"} isMissing={!row.isGraded || row.bestScore === null} />
                              <DetailItem
                                label="Result"
                                value={!row.isGraded ? "Not graded" : row.passed === null ? "Not determined" : row.passed ? "Passed" : "Failed"}
                                isMissing={!row.isGraded || row.passed === null}
                                valueClassName={
                                  !row.isGraded || row.passed === null
                                    ? "text-slate-500"
                                    : row.passed
                                      ? "font-semibold text-green-700"
                                      : "font-semibold text-red-700"
                                }
                              />
                              <DetailItem label="Time to complete" value={formatTrainingDuration(row.trainingDurationSeconds)} isMissing={row.trainingDurationSeconds === null} />
                              <DetailItem label="Renewal" value={row.module?.renewal_period_days ? `Every ${row.module.renewal_period_days} days` : "Not required"} isMissing={!row.module?.renewal_period_days} />
                              <DetailItem label="Assigned by" value={row.assignedByName || row.assignmentSource} className="sm:col-span-2" />
                            </div>
                            <h4 className="mt-5 text-xs font-bold uppercase tracking-wide text-slate-600">Attempt History</h4>
                            {row.attempts.length === 0 ? <p className="mt-2 text-sm text-slate-500">{row.isGraded ? "No quiz attempts recorded." : "This training is not graded."}</p> : (
                              <div className="mt-2 overflow-x-auto rounded-lg border border-slate-300 bg-white"><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-slate-100 text-xs uppercase text-slate-600"><tr><th className="px-3 py-2 font-bold">Attempt</th><th className="px-3 py-2 font-bold">Score</th><th className="px-3 py-2 font-bold">Result</th><th className="px-3 py-2 font-bold">Started</th><th className="px-3 py-2 font-bold">Completed</th><th className="px-3 py-2 font-bold">Quiz Duration</th></tr></thead><tbody className="text-slate-900">{row.attempts.map((attempt) => <tr key={attempt.id} className="border-t border-slate-200"><td className="px-3 py-2 font-semibold text-slate-900">{attempt.attemptNumber}</td><td className={`px-3 py-2 font-medium ${attempt.score === null ? "text-slate-500" : "text-slate-900"}`}>{formatPercent(attempt.score)}</td><td className={`px-3 py-2 font-semibold ${attempt.passed === null ? "text-slate-500" : attempt.passed ? "text-green-700" : "text-red-700"}`}>{attempt.passed === null ? "Not determined" : attempt.passed ? "Passed" : "Failed"}</td><td className="px-3 py-2 text-slate-800">{formatDate(attempt.startedAt)}</td><td className="px-3 py-2 text-slate-800">{formatDate(attempt.completedAt)}</td><td className={`px-3 py-2 ${attempt.durationSeconds === null ? "text-slate-500" : "text-slate-800"}`}>{formatQuizDuration(attempt.durationSeconds)}</td></tr>)}</tbody></table></div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        ) : null}
      </section>
    </div>
  );
}
