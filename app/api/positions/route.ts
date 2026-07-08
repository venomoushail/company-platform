import { NextResponse } from "next/server";
import { requireAdminAreaContext, jsonError } from "@/lib/auth/api";
import type { EmployeePosition, Position, TrainingModulePosition } from "@/types/supabase";

export const dynamic = "force-dynamic";

type PositionPayload = {
  id?: unknown;
  name?: unknown;
  is_active?: unknown;
};

type PositionField = keyof PositionPayload;

type PositionWithCounts = Position & {
  employee_count: number;
  assigned_training_count: number;
};

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function validatePositionPayload(payload: PositionPayload) {
  const fieldErrors: Partial<Record<PositionField, string>> = {};
  const name = readString(payload.name);
  const isActive =
    typeof payload.is_active === "boolean" ? payload.is_active : true;

  if (!name) {
    fieldErrors.name = "Position name is required.";
  }

  return {
    values: {
      name,
      isActive,
    },
    fieldErrors,
  };
}

function getPositionId(payload: PositionPayload) {
  return readString(payload.id);
}

function buildPositionCounts(
  positions: Position[],
  employeePositions: Pick<EmployeePosition, "position_id">[],
  trainingPositions: Pick<TrainingModulePosition, "position_id">[]
) {
  const countsByPositionId = new Map<
    string,
    { employee_count: number; assigned_training_count: number }
  >();

  for (const position of positions) {
    countsByPositionId.set(position.id, {
      employee_count: 0,
      assigned_training_count: 0,
    });
  }

  for (const assignment of employeePositions) {
    const counts = countsByPositionId.get(assignment.position_id);
    if (counts) counts.employee_count += 1;
  }

  for (const assignment of trainingPositions) {
    const counts = countsByPositionId.get(assignment.position_id);
    if (counts) counts.assigned_training_count += 1;
  }

  return positions.map<PositionWithCounts>((position) => ({
    ...position,
    ...(countsByPositionId.get(position.id) ?? {
      employee_count: 0,
      assigned_training_count: 0,
    }),
  }));
}

async function fetchPositionsWithCounts(
  supabase: NonNullable<
    Awaited<ReturnType<typeof requireAdminAreaContext>>["supabase"]
  >,
  companyId: string,
  positionIds: string[] | null = null
) {
  const positionsQuery = supabase
    .from("positions")
    .select("*")
    .eq("company_id", companyId)
    .order("name", { ascending: true });
  const scopedPositionsQuery =
    positionIds === null
      ? positionsQuery
      : positionIds.length > 0
        ? positionsQuery.in("id", positionIds)
        : positionsQuery.limit(0);

  const positionsResult = await scopedPositionsQuery;

  if (positionsResult.error) {
    console.error("[positions] Position fetch failed", positionsResult.error);
    return {
      response: jsonError("Unable to load positions.", 500),
      positions: null,
    };
  }

  const positions = positionsResult.data ?? [];
  const scopedPositionIds = positions.map((position) => position.id);

  if (scopedPositionIds.length === 0) {
    return {
      response: null,
      positions: [],
    };
  }

  const [employeePositionsResult, trainingPositionsResult] = await Promise.all([
    supabase
      .from("employee_positions")
      .select("position_id")
      .in("position_id", scopedPositionIds),
    supabase
      .from("training_module_positions")
      .select("position_id")
      .eq("company_id", companyId)
      .in("position_id", scopedPositionIds),
  ]);

  if (employeePositionsResult.error) {
    console.error(
      "[positions] Employee position counts fetch failed",
      employeePositionsResult.error
    );
    return {
      response: jsonError("Unable to load position employee counts.", 500),
      positions: null,
    };
  }

  if (trainingPositionsResult.error) {
    console.error(
      "[positions] Training position counts fetch failed",
      trainingPositionsResult.error
    );
    return {
      response: jsonError("Unable to load position training counts.", 500),
      positions: null,
    };
  }

  return {
    response: null,
    positions: buildPositionCounts(
      positions,
      employeePositionsResult.data ?? [],
      trainingPositionsResult.data ?? []
    ),
  };
}

async function findDuplicatePosition(
  supabase: NonNullable<
    Awaited<ReturnType<typeof requireAdminAreaContext>>["supabase"]
  >,
  companyId: string,
  name: string,
  currentPositionId?: string
) {
  const duplicateNameQuery = supabase
    .from("positions")
    .select("id")
    .eq("company_id", companyId)
    .ilike("name", name)
    .limit(1);

  if (currentPositionId) {
    duplicateNameQuery.neq("id", currentPositionId);
  }

  const { data, error } = await duplicateNameQuery;

  if (error) {
    console.error("[positions] Duplicate check failed", error);
    return {
      response: jsonError("Unable to validate position uniqueness.", 500),
    };
  }

  if ((data?.length ?? 0) > 0) {
    return {
      response: jsonError("Fix the highlighted fields.", 409, {
        name: "A position with this name already exists.",
      }),
    };
  }

  return { response: null };
}

export async function GET(request: Request) {
  const { response, supabase, profile } =
    await requireAdminAreaContext(request, "positions");

  if (response) return response;

  const result = await fetchPositionsWithCounts(supabase, profile.company_id);

  if (result.response) return result.response;

  return NextResponse.json({
    positions: result.positions,
    canEdit: profile.role === "admin",
  });
}

export async function POST(request: Request) {
  const { response, supabase, profile } =
    await requireAdminAreaContext(request, "positions");

  if (response) return response;

  if (!profile.is_active || profile.role !== "admin") {
    return jsonError("Only active admins can create positions.", 403);
  }

  let payload: PositionPayload;

  try {
    payload = (await request.json()) as PositionPayload;
  } catch (error) {
    console.error("[positions] Payload parsing failed", error);
    return jsonError("Unable to create position.", 400);
  }

  const { values, fieldErrors } = validatePositionPayload(payload);

  if (Object.keys(fieldErrors).length > 0) {
    return jsonError("Fix the highlighted fields.", 400, fieldErrors);
  }

  const duplicate = await findDuplicatePosition(
    supabase,
    profile.company_id,
    values.name
  );

  if (duplicate.response) return duplicate.response;

  const { data: position, error } = await supabase
    .from("positions")
    .insert({
      name: values.name,
      is_active: values.isActive,
      company_id: profile.company_id,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[positions] Position insert failed", error);
    return jsonError("Unable to create position.", 500);
  }

  return NextResponse.json(
    {
      position: {
        ...position,
        employee_count: 0,
        assigned_training_count: 0,
      } satisfies PositionWithCounts,
    },
    { status: 201 }
  );
}

export async function PATCH(request: Request) {
  const { response, supabase, profile } =
    await requireAdminAreaContext(request, "positions");

  if (response) return response;

  if (!profile.is_active || profile.role !== "admin") {
    return jsonError("Only active admins can edit positions.", 403);
  }

  let payload: PositionPayload;

  try {
    payload = (await request.json()) as PositionPayload;
  } catch (error) {
    console.error("[positions] Update payload parsing failed", error);
    return jsonError("Unable to update position.", 400);
  }

  const positionId = getPositionId(payload);

  if (!positionId) {
    return jsonError("Choose a position to update.", 400, {
      id: "Choose a position to update.",
    });
  }

  const { values, fieldErrors } = validatePositionPayload(payload);

  if (Object.keys(fieldErrors).length > 0) {
    return jsonError("Fix the highlighted fields.", 400, fieldErrors);
  }

  const { data: existingPosition, error: existingPositionError } =
    await supabase
      .from("positions")
      .select("id")
      .eq("id", positionId)
      .eq("company_id", profile.company_id)
      .maybeSingle();

  if (existingPositionError) {
    console.error("[positions] Position lookup failed", existingPositionError);
    return jsonError("Unable to update position.", 500);
  }

  if (!existingPosition) {
    return jsonError("Position not found.", 404);
  }

  const duplicate = await findDuplicatePosition(
    supabase,
    profile.company_id,
    values.name,
    positionId
  );

  if (duplicate.response) return duplicate.response;

  const { data: position, error } = await supabase
    .from("positions")
    .update({
      name: values.name,
      is_active: values.isActive,
    })
    .eq("id", positionId)
    .eq("company_id", profile.company_id)
    .select("*")
    .single();

  if (error) {
    console.error("[positions] Position update failed", error);
    return jsonError("Unable to update position.", 500);
  }

  const result = await fetchPositionsWithCounts(supabase, profile.company_id, [
    position.id,
  ]);

  if (result.response) return result.response;

  return NextResponse.json({
    position: result.positions?.[0] ?? {
      ...position,
      employee_count: 0,
      assigned_training_count: 0,
    },
  });
}
