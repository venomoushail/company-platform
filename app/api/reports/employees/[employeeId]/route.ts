import { NextResponse } from "next/server";
import { canAccessEmployee } from "@/lib/auth/scope";
import { requireReportScope } from "@/lib/reports/requireReportScope";
import {
  buildAssignmentReportRow,
  calculateEmployeeReportSummary,
} from "@/lib/reports/employeeTrainingReport";
import type { QuizAttempt } from "@/types/supabase";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ employeeId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { employeeId } = await context.params;
  if (!/^[0-9a-f-]{20,64}$/i.test(employeeId)) {
    return NextResponse.json({ error: "Choose a valid employee." }, { status: 400 });
  }

  const { response, supabase, scope } = await requireReportScope(request);
  if (response || !supabase || !scope) return response;

  const employeeResult = await supabase
    .from("profiles")
    .select("*")
    .eq("id", employeeId)
    .eq("company_id", scope.companyId)
    .maybeSingle();

  if (employeeResult.error) {
    console.error("[employee-reports] Employee lookup failed", employeeResult.error);
    return NextResponse.json({ error: "Unable to load this employee." }, { status: 500 });
  }
  const employee = employeeResult.data;
  if (!employee || !canAccessEmployee(scope, employee)) {
    return NextResponse.json({ error: "Employee report not found." }, { status: 404 });
  }

  const [assignmentsResult, employeePositionsResult, positionsResult, locationResult] =
    await Promise.all([
      supabase
        .from("training_assignments")
        .select("*")
        .eq("employee_id", employee.id)
        .order("assigned_at", { ascending: false }),
      supabase
        .from("employee_positions")
        .select("*")
        .eq("employee_id", employee.id),
      supabase
        .from("positions")
        .select("*")
        .eq("company_id", scope.companyId)
        .order("name"),
      employee.location_id
        ? supabase
            .from("locations")
            .select("*")
            .eq("id", employee.location_id)
            .eq("company_id", scope.companyId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

  const lookupError =
    assignmentsResult.error ||
    employeePositionsResult.error ||
    positionsResult.error ||
    locationResult.error;
  if (lookupError) {
    console.error("[employee-reports] Employee detail lookup failed", lookupError);
    return NextResponse.json({ error: "Unable to load employee training history." }, { status: 500 });
  }

  const assignments = assignmentsResult.data ?? [];
  const moduleIds = Array.from(
    new Set(assignments.map((assignment) => assignment.module_id))
  );
  const assignmentIds = assignments.map((assignment) => assignment.id);
  const assignedByIds = Array.from(
    new Set(
      assignments
        .map((assignment) => assignment.assigned_by)
        .filter((id): id is string => Boolean(id))
    )
  );
  const [modulesResult, attemptsResult, assignersResult, questionsResult] = await Promise.all([
    moduleIds.length > 0
      ? supabase
          .from("training_modules")
          .select("*")
          .eq("company_id", scope.companyId)
          .in("id", moduleIds)
      : Promise.resolve({ data: [], error: null }),
    assignmentIds.length > 0
      ? supabase
          .from("quiz_attempts")
          .select("*")
          .eq("company_id", scope.companyId)
          .in("assignment_id", assignmentIds)
      : Promise.resolve({ data: [], error: null }),
    assignedByIds.length > 0
      ? supabase
          .from("profiles")
          .select("id,full_name")
          .eq("company_id", scope.companyId)
          .in("id", assignedByIds)
      : Promise.resolve({ data: [], error: null }),
    moduleIds.length > 0
      ? supabase
          .from("quiz_questions")
          .select("module_id")
          .eq("company_id", scope.companyId)
          .eq("is_active", true)
          .in("module_id", moduleIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (
    modulesResult.error ||
    attemptsResult.error ||
    assignersResult.error ||
    questionsResult.error
  ) {
    console.error(
      "[employee-reports] Employee training lookup failed",
      modulesResult.error ||
        attemptsResult.error ||
        assignersResult.error ||
        questionsResult.error
    );
    return NextResponse.json({ error: "Unable to load training attempts." }, { status: 500 });
  }

  const moduleById = new Map(
    (modulesResult.data ?? []).map((module) => [module.id, module])
  );
  const attemptsByAssignment = new Map<string, QuizAttempt[]>();
  (attemptsResult.data ?? []).forEach((attempt) => {
    attemptsByAssignment.set(attempt.assignment_id, [
      ...(attemptsByAssignment.get(attempt.assignment_id) ?? []),
      attempt,
    ]);
  });
  const assignerById = new Map(
    (assignersResult.data ?? []).map((profile) => [profile.id, profile.full_name])
  );
  const moduleIdsWithQuiz = new Set(
    (questionsResult.data ?? []).map((question) => question.module_id)
  );
  const rows = assignments.map((assignment) => ({
    ...buildAssignmentReportRow(
      assignment,
      moduleById.get(assignment.module_id) ?? null,
      attemptsByAssignment.get(assignment.id) ?? [],
      moduleIdsWithQuiz.has(assignment.module_id)
    ),
    assignedByName: assignment.assigned_by
      ? assignerById.get(assignment.assigned_by) ?? "Former administrator"
      : null,
    // The current schema does not retain a rule ID/source on each assignment.
    assignmentSource: assignment.assigned_by ? "Assigned by administrator" : "Automatic/system",
  }));
  const selectedPositionIds = new Set(
    (employeePositionsResult.data ?? []).map((item) => item.position_id)
  );

  return NextResponse.json({
    employee,
    location: locationResult.data,
    positions: (positionsResult.data ?? []).filter((position) =>
      selectedPositionIds.has(position.id)
    ),
    summary: calculateEmployeeReportSummary(rows),
    trainings: rows,
    permissions: {
      canEditEmployee: scope.isAdmin || scope.isManager,
    },
  });
}
