"use client";

import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type {
  Location,
  Profile,
  TrainingAssignment,
  TrainingModule,
} from "@/types/supabase";

type TrainingResultRow = {
  assignment: TrainingAssignment;
  employee: Profile;
  module: TrainingModule;
  location: Location | null;
};

type TrainingResultsResponse = {
  results: TrainingResultRow[];
  modules: TrainingModule[];
  locations: Location[];
};

type PageStatus = "loading" | "success" | "error";

const statusOptions = ["not_started", "in_progress", "completed", "failed"];
const filterControlClass =
  "mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-blue-600";

function getReadableErrorMessage(data: unknown, fallback: string) {
  if (!data || typeof data !== "object") return fallback;

  const error = (data as { error?: unknown }).error;
  return typeof error === "string" ? error : fallback;
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function formatDateTime(value: string | null) {
  if (!value) return "Not set";

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatLocation(location: Location | null) {
  if (!location) return "Not assigned";

  return `Store ${location.store_number} - ${location.name}`;
}

function formatStatus(status: TrainingAssignment["status"]) {
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function statusBadgeClass(status: TrainingAssignment["status"]) {
  if (status === "completed") return "bg-green-100 text-green-700";
  if (status === "failed") return "bg-red-100 text-red-700";
  if (status === "in_progress") return "bg-blue-100 text-blue-700";

  return "bg-slate-100 text-slate-600";
}

function formatPassed(value: boolean | null) {
  if (value === null) return "Not set";

  return value ? "Yes" : "No";
}

export default function TrainingResultsPage() {
  const [results, setResults] = useState<TrainingResultRow[]>([]);
  const [modules, setModules] = useState<TrainingModule[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [moduleFilter, setModuleFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [pageStatus, setPageStatus] = useState<PageStatus>("loading");
  const [pageError, setPageError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadTrainingResults() {
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
        setPageError(error?.message || "Sign in to view training results.");
        return;
      }

      const response = await fetch("/api/training-results", {
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
        },
      });
      const responseData = (await response.json().catch(() => null)) as
        | TrainingResultsResponse
        | { error?: string }
        | null;

      if (!isMounted) return;

      if (!response.ok) {
        setPageStatus("error");
        setPageError(
          getReadableErrorMessage(responseData, "Unable to load training results.")
        );
        return;
      }

      const trainingData = responseData as TrainingResultsResponse;

      setResults(trainingData.results);
      setModules(trainingData.modules);
      setLocations(trainingData.locations);
      setPageStatus("success");
    }

    loadTrainingResults();

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredResults = useMemo(() => {
    const query = normalize(searchQuery);

    return results.filter((result) => {
      const matchesModule =
        moduleFilter === "all" || result.module.id === moduleFilter;
      const matchesLocation =
        locationFilter === "all" ||
        (locationFilter === "__unassigned__" && !result.employee.location_id) ||
        result.employee.location_id === locationFilter;
      const matchesStatus =
        statusFilter === "all" || result.assignment.status === statusFilter;
      const matchesSearch =
        !query ||
        normalize(result.employee.full_name).includes(query) ||
        normalize(result.employee.employee_number).includes(query);

      return matchesModule && matchesLocation && matchesStatus && matchesSearch;
    });
  }, [locationFilter, moduleFilter, results, searchQuery, statusFilter]);

  return (
    <AdminLayout
      title="Training Results"
      description="Review employee training assignment status and quiz outcomes."
    >
      <div className="space-y-6">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_240px_220px_180px] xl:items-end">
            <div>
              <label className="block text-sm font-semibold text-slate-700">
                Search
              </label>
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Employee name or number"
                className={filterControlClass}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700">
                Training Module
              </label>
              <select
                value={moduleFilter}
                onChange={(event) => setModuleFilter(event.target.value)}
                className={filterControlClass}
              >
                <option value="all">All modules</option>
                {modules.map((module) => (
                  <option key={module.id} value={module.id}>
                    {module.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700">
                Location
              </label>
              <select
                value={locationFilter}
                onChange={(event) => setLocationFilter(event.target.value)}
                className={filterControlClass}
              >
                <option value="all">All locations</option>
                <option value="__unassigned__">Unassigned</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {formatLocation(location)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className={filterControlClass}
              >
                <option value="all">All statuses</option>
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {formatStatus(status as TrainingAssignment["status"])}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {pageStatus === "error" && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {pageError}
          </div>
        )}

        <section className="rounded-xl bg-white shadow-sm">
          {pageStatus === "loading" ? (
            <div className="px-6 py-12 text-center">
              <p className="font-semibold text-slate-900">
                Loading training results
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Fetching assignment rows from Supabase.
              </p>
            </div>
          ) : filteredResults.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="font-semibold text-slate-900">No results found</p>
              <p className="mt-2 text-sm text-slate-500">
                Adjust your filters or wait for employees to start assigned training.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1320px] border-collapse text-left">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                      Employee
                    </th>
                    <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                      Employee #
                    </th>
                    <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                      Location
                    </th>
                    <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                      Module
                    </th>
                    <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                      Status
                    </th>
                    <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                      Progress
                    </th>
                    <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                      Latest Score
                    </th>
                    <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                      Passed
                    </th>
                    <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                      Assigned
                    </th>
                    <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                      Completed
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {filteredResults.map((result) => (
                    <tr
                      key={result.assignment.id}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                    >
                      <td className="px-6 py-4 text-sm">
                        <p className="font-medium text-slate-900">
                          {result.employee.full_name}
                        </p>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {result.employee.employee_number}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {formatLocation(result.location)}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {result.module.title}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${statusBadgeClass(
                            result.assignment.status
                          )}`}
                        >
                          {formatStatus(result.assignment.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {result.assignment.progress_percent}%
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {result.assignment.latest_score === null
                          ? "Not set"
                          : `${result.assignment.latest_score}%`}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {formatPassed(result.assignment.passed)}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {formatDateTime(result.assignment.assigned_at)}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {formatDateTime(result.assignment.completed_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AdminLayout>
  );
}
