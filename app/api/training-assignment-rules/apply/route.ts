import { NextResponse } from "next/server";
import { requireAdminAreaContext, jsonError } from "@/lib/auth/api";
import { applyAssignmentRulesForEmployees } from "@/lib/training/assignmentRules";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { response, supabase, profile, scope } =
    await requireAdminAreaContext(request, "assignment rules");

  if (response) return response;

  if (!profile.is_active || profile.role !== "admin") {
    return jsonError("Only active admins can apply assignment rules.", 403);
  }

  const { data: employees, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("company_id", scope.companyId)
    .eq("is_active", true);

  if (error) {
    console.error("[assignment-rules] Apply employee lookup failed", error);
    return jsonError("Unable to apply assignment rules.", 500);
  }

  try {
    const result = await applyAssignmentRulesForEmployees(
      (employees ?? []).map((employee) => employee.id),
      "manual",
      {
        supabase,
        assignedBy: profile.id,
      }
    );

    return NextResponse.json({ result });
  } catch (applyError) {
    console.error("[assignment-rules] Apply failed", applyError);
    return jsonError("Unable to apply assignment rules.", 500);
  }
}
