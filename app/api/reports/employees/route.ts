import { NextResponse } from "next/server";
import { requireReportScope } from "@/lib/reports/requireReportScope";
import {
  buildAssignmentReportRow,
  calculateEmployeeReportSummary,
} from "@/lib/reports/employeeTrainingReport";
import type { QuizAttempt, TrainingAssignment } from "@/types/supabase";

export const dynamic = "force-dynamic";

const validActivityFilters = new Set(["all", "active", "inactive"]);
const validSorts = new Set(["name", "completion_rate", "overdue_count"]);

function normalizedQuery(value: string | null, maxLength = 100) {
  return (value || "").trim().slice(0, maxLength).toLowerCase();
}

export async function GET(request: Request) {
  const { response, supabase, scope } = await requireReportScope(request);
  if (response || !supabase || !scope) return response;

  const url = new URL(request.url);
  const search = normalizedQuery(url.searchParams.get("search"));
  const locationId = normalizedQuery(url.searchParams.get("locationId"));
  const positionId = normalizedQuery(url.searchParams.get("positionId"));
  const requestedActivity = normalizedQuery(url.searchParams.get("activity"));
  const activity = validActivityFilters.has(requestedActivity)
    ? requestedActivity
    : "all";
  const requestedSort = normalizedQuery(url.searchParams.get("sort"));
  const sort = validSorts.has(requestedSort) ? requestedSort : "name";

  const employeesQuery = supabase
    .from("profiles")
    .select("*")
    .eq("company_id", scope.companyId);
  const scopedEmployeesQuery = scope.canAccessAllLocations
    ? employeesQuery
    : scope.locationIds.length > 0
      ? employeesQuery.in("location_id", scope.locationIds)
      : employeesQuery.limit(0);
  const locationsQuery = supabase
    .from("locations")
    .select("*")
    .eq("company_id", scope.companyId)
    .order("store_number");

  const [employeesResult, locationsResult, positionsResult, modulesResult] =
    await Promise.all([
      scopedEmployeesQuery,
      scope.canAccessAllLocations
        ? locationsQuery
        : scope.locationIds.length > 0
          ? locationsQuery.in("id", scope.locationIds)
          : locationsQuery.limit(0),
      supabase
        .from("positions")
        .select("*")
        .eq("company_id", scope.companyId)
        .order("name"),
      supabase
        .from("training_modules")
        .select("*")
        .eq("company_id", scope.companyId),
    ]);

  const lookupError =
    employeesResult.error ||
    locationsResult.error ||
    positionsResult.error ||
    modulesResult.error;
  if (lookupError) {
    console.error("[employee-reports] List lookup failed", lookupError);
    return NextResponse.json({ error: "Unable to load employee reports." }, { status: 500 });
  }

  const employees = employeesResult.data ?? [];
  const employeeIds = employees.map((employee) => employee.id);
  let employeePositions: { employee_id: string; position_id: string }[] = [];
  let assignments: TrainingAssignment[] = [];

  if (employeeIds.length > 0) {
    const [employeePositionsResult, assignmentsResult] = await Promise.all([
      supabase.from("employee_positions").select("*").in("employee_id", employeeIds),
      supabase
        .from("training_assignments")
        .select("*")
        .in("employee_id", employeeIds),
    ]);
    if (employeePositionsResult.error || assignmentsResult.error) {
      console.error(
        "[employee-reports] Assignment lookup failed",
        employeePositionsResult.error || assignmentsResult.error
      );
      return NextResponse.json({ error: "Unable to load employee assignments." }, { status: 500 });
    }
    employeePositions = employeePositionsResult.data ?? [];
    assignments = assignmentsResult.data ?? [];
  }

  let attempts: QuizAttempt[] = [];
  const assignmentIds = assignments.map((assignment) => assignment.id);
  if (assignmentIds.length > 0) {
    const attemptsResult = await supabase
      .from("quiz_attempts")
      .select("*")
      .eq("company_id", scope.companyId)
      .in("assignment_id", assignmentIds);
    if (attemptsResult.error) {
      console.error("[employee-reports] Attempt lookup failed", attemptsResult.error);
      return NextResponse.json({ error: "Unable to load employee scores." }, { status: 500 });
    }
    attempts = attemptsResult.data ?? [];
  }

  const locationById = new Map(
    (locationsResult.data ?? []).map((location) => [location.id, location])
  );
  const positionById = new Map(
    (positionsResult.data ?? []).map((position) => [position.id, position])
  );
  const moduleById = new Map(
    (modulesResult.data ?? []).map((module) => [module.id, module])
  );
  const positionIdsByEmployee = new Map<string, string[]>();
  employeePositions.forEach((item) => {
    positionIdsByEmployee.set(item.employee_id, [
      ...(positionIdsByEmployee.get(item.employee_id) ?? []),
      item.position_id,
    ]);
  });
  const assignmentsByEmployee = new Map<string, TrainingAssignment[]>();
  assignments.forEach((assignment) => {
    assignmentsByEmployee.set(assignment.employee_id, [
      ...(assignmentsByEmployee.get(assignment.employee_id) ?? []),
      assignment,
    ]);
  });
  const attemptsByAssignment = new Map<string, QuizAttempt[]>();
  attempts.forEach((attempt) => {
    attemptsByAssignment.set(attempt.assignment_id, [
      ...(attemptsByAssignment.get(attempt.assignment_id) ?? []),
      attempt,
    ]);
  });

  const reportEmployees = employees
    .map((employee) => {
      const positions = (positionIdsByEmployee.get(employee.id) ?? []).flatMap(
        (id) => {
          const position = positionById.get(id);
          return position ? [position] : [];
        }
      );
      const rows = (assignmentsByEmployee.get(employee.id) ?? []).map(
        (assignment) =>
          buildAssignmentReportRow(
            assignment,
            moduleById.get(assignment.module_id) ?? null,
            attemptsByAssignment.get(assignment.id) ?? []
          )
      );

      return {
        employee,
        location: employee.location_id
          ? locationById.get(employee.location_id) ?? null
          : null,
        positions,
        summary: calculateEmployeeReportSummary(rows),
      };
    })
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
      const matchesSearch = !search || searchable.includes(search);
      const matchesLocation = !locationId || item.employee.location_id === locationId;
      const matchesPosition =
        !positionId || item.positions.some((position) => position.id === positionId);
      const matchesActivity =
        activity === "all" ||
        (activity === "active" ? item.employee.is_active : !item.employee.is_active);
      return matchesSearch && matchesLocation && matchesPosition && matchesActivity;
    })
    .sort((left, right) => {
      if (sort === "completion_rate") {
        return (
          (right.summary.completionRate ?? -1) -
            (left.summary.completionRate ?? -1) ||
          left.employee.full_name.localeCompare(right.employee.full_name)
        );
      }
      if (sort === "overdue_count") {
        return (
          right.summary.pastDue - left.summary.pastDue ||
          left.employee.full_name.localeCompare(right.employee.full_name)
        );
      }
      return left.employee.full_name.localeCompare(right.employee.full_name);
    });

  return NextResponse.json({
    employees: reportEmployees,
    locations: locationsResult.data ?? [],
    positions: positionsResult.data ?? [],
  });
}
