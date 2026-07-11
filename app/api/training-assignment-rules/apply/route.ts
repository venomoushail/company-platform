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

  const payload = (await request.json().catch(() => ({}))) as {
    module_id?: unknown;
  };
  const moduleId = typeof payload.module_id === "string" ? payload.module_id.trim() : "";

  if (moduleId) {
    const { data: module, error: moduleError } = await supabase
      .from("training_modules")
      .select("id,status")
      .eq("id", moduleId)
      .eq("company_id", scope.companyId)
      .maybeSingle();

    if (moduleError) {
      console.error("[assignment-rules] Apply module lookup failed", moduleError);
      return jsonError("Unable to apply assignment rules.", 500);
    }

    if (!module) return jsonError("Training module not found.", 404);
    if (module.status !== "published") {
      return jsonError("Publish this training before applying assignment rules.", 400);
    }
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
        moduleId: moduleId || null,
      }
    );

    return NextResponse.json({ result });
  } catch (applyError) {
    console.error("[assignment-rules] Apply failed", applyError);
    return jsonError("Unable to apply assignment rules.", 500);
  }
}
