import { NextResponse } from "next/server";
import { requireAdminAreaContext, jsonError } from "@/lib/auth/api";
import type { Location, Profile } from "@/types/supabase";

export const dynamic = "force-dynamic";

type LocationPayload = {
  id?: unknown;
  name?: unknown;
  store_number?: unknown;
  is_active?: unknown;
};

type LocationField = keyof LocationPayload;

type LocationWithCounts = Location & {
  employee_count: number;
  manager_count: number;
};

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readPositiveInteger(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) return null;

  const parsedValue = Number(value);

  return Number.isSafeInteger(parsedValue) && parsedValue > 0
    ? parsedValue
    : null;
}

function validateLocationPayload(payload: LocationPayload) {
  const fieldErrors: Partial<Record<LocationField, string>> = {};
  const storeNumber = readPositiveInteger(payload.store_number);
  const name = readString(payload.name);
  const isActive =
    typeof payload.is_active === "boolean" ? payload.is_active : true;

  if (storeNumber === null) {
    fieldErrors.store_number = "Store Number must be a positive integer.";
  }

  if (!name) {
    fieldErrors.name = "Location name is required.";
  }

  return {
    values: {
      storeNumber,
      name,
      isActive,
    },
    fieldErrors,
  };
}

function getLocationId(payload: LocationPayload) {
  return readString(payload.id);
}

function buildLocationCounts(
  locations: Location[],
  profiles: Pick<Profile, "id" | "location_id" | "role">[],
  managerLocations: { manager_id: string; location_id: string }[]
) {
  const countsByLocationId = new Map<
    string,
    { employee_count: number; manager_count: number }
  >();

  for (const location of locations) {
    countsByLocationId.set(location.id, {
      employee_count: 0,
      manager_count: 0,
    });
  }

  const managersWithManagedLocations = new Set(
    managerLocations.map((assignment) => assignment.manager_id)
  );
  const managerIdsByLocationId = new Map<string, Set<string>>();

  for (const assignment of managerLocations) {
    managerIdsByLocationId.set(
      assignment.location_id,
      new Set([
        ...(managerIdsByLocationId.get(assignment.location_id) ?? []),
        assignment.manager_id,
      ])
    );
  }

  for (const profile of profiles) {
    if (!profile.location_id) continue;

    const counts = countsByLocationId.get(profile.location_id);
    if (!counts) continue;

    counts.employee_count += 1;

    if (
      profile.role === "manager" &&
      !managersWithManagedLocations.has(profile.id)
    ) {
      managerIdsByLocationId.set(
        profile.location_id,
        new Set([
          ...(managerIdsByLocationId.get(profile.location_id) ?? []),
          profile.id,
        ])
      );
    }
  }

  for (const [locationId, managerIds] of managerIdsByLocationId) {
    const counts = countsByLocationId.get(locationId);
    if (counts) counts.manager_count = managerIds.size;
  }

  return locations.map<LocationWithCounts>((location) => ({
    ...location,
    ...(countsByLocationId.get(location.id) ?? {
      employee_count: 0,
      manager_count: 0,
    }),
  }));
}

async function fetchLocationsWithCounts(
  supabase: NonNullable<
    Awaited<ReturnType<typeof requireAdminAreaContext>>["supabase"]
  >,
  companyId: string,
  locationIds: string[] | null
) {
  const locationsQuery = supabase
    .from("locations")
    .select("*")
    .eq("company_id", companyId)
    .order("store_number", { ascending: true });
  const scopedLocationsQuery =
    locationIds === null
      ? locationsQuery
      : locationIds.length > 0
        ? locationsQuery.in("id", locationIds)
        : locationsQuery.limit(0);

  const [locationsResult, profilesResult, managerLocationsResult] = await Promise.all([
    scopedLocationsQuery,
    supabase
      .from("profiles")
      .select("id,location_id,role")
      .eq("company_id", companyId),
    supabase
      .from("manager_locations")
      .select("manager_id,location_id")
      .eq("company_id", companyId),
  ]);

  if (locationsResult.error) {
    console.error("[locations] Location fetch failed", locationsResult.error);
    return {
      response: jsonError("Unable to load locations.", 500),
      locations: null,
    };
  }

  if (profilesResult.error) {
    console.error("[locations] Location counts fetch failed", profilesResult.error);
    return {
      response: jsonError("Unable to load location counts.", 500),
      locations: null,
    };
  }

  if (managerLocationsResult.error) {
    console.error(
      "[locations] Manager location counts fetch failed",
      managerLocationsResult.error
    );
    return {
      response: jsonError("Unable to load location manager counts.", 500),
      locations: null,
    };
  }

  return {
    response: null,
    locations: buildLocationCounts(
      locationsResult.data ?? [],
      profilesResult.data ?? [],
      managerLocationsResult.data ?? []
    ),
  };
}

async function findDuplicateLocation(
  supabase: NonNullable<
    Awaited<ReturnType<typeof requireAdminAreaContext>>["supabase"]
  >,
  companyId: string,
  values: { storeNumber: number; name: string },
  currentLocationId?: string
) {
  const duplicateStoreQuery = supabase
    .from("locations")
    .select("id")
    .eq("company_id", companyId)
    .eq("store_number", values.storeNumber)
    .limit(1);
  const duplicateNameQuery = supabase
    .from("locations")
    .select("id")
    .eq("company_id", companyId)
    .ilike("name", values.name)
    .limit(1);

  if (currentLocationId) {
    duplicateStoreQuery.neq("id", currentLocationId);
    duplicateNameQuery.neq("id", currentLocationId);
  }

  const [storeResult, nameResult] = await Promise.all([
    duplicateStoreQuery,
    duplicateNameQuery,
  ]);

  if (storeResult.error || nameResult.error) {
    console.error("[locations] Duplicate check failed", {
      storeError: storeResult.error,
      nameError: nameResult.error,
    });

    return {
      response: jsonError("Unable to validate location uniqueness.", 500),
      fieldErrors: null,
    };
  }

  const fieldErrors: Partial<Record<LocationField, string>> = {};

  if ((storeResult.data?.length ?? 0) > 0) {
    fieldErrors.store_number =
      "A location with this store number already exists.";
  }

  if ((nameResult.data?.length ?? 0) > 0) {
    fieldErrors.name = "A location with this name already exists.";
  }

  return {
    response:
      Object.keys(fieldErrors).length > 0
        ? jsonError("Fix the highlighted fields.", 409, fieldErrors)
        : null,
    fieldErrors,
  };
}

export async function GET(request: Request) {
  const { response, supabase, profile, scope } =
    await requireAdminAreaContext(request, "locations");

  if (response) return response;

  const result = await fetchLocationsWithCounts(
    supabase,
    scope.companyId,
    null
  );

  if (result.response) return result.response;

  return NextResponse.json({
    locations: result.locations,
    canEdit: profile.role === "admin",
  });
}

export async function POST(request: Request) {
  const { response, supabase, profile, scope } =
    await requireAdminAreaContext(request, "locations");

  if (response) return response;

  if (!profile.is_active || profile.role !== "admin") {
    return jsonError("Only active admins can create locations.", 403);
  }

  let payload: LocationPayload;

  try {
    payload = (await request.json()) as LocationPayload;
  } catch (error) {
    console.error("[locations] Payload parsing failed", error);
    return jsonError("Unable to create location.", 400);
  }

  const { values, fieldErrors } = validateLocationPayload(payload);

  if (Object.keys(fieldErrors).length > 0) {
    return jsonError("Fix the highlighted fields.", 400, fieldErrors);
  }

  if (values.storeNumber === null) {
    return jsonError("Fix the highlighted fields.", 400, {
      store_number: "Store Number must be a positive integer.",
    });
  }

  const duplicates = await findDuplicateLocation(
    supabase,
    scope.companyId,
    {
      storeNumber: values.storeNumber,
      name: values.name,
    }
  );

  if (duplicates.response) return duplicates.response;

  const { data: location, error } = await supabase
    .from("locations")
    .insert({
      name: values.name,
      store_number: values.storeNumber,
      is_active: values.isActive,
      company_id: scope.companyId,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[locations] Location insert failed", error);
    return jsonError("Unable to create location.", 500);
  }

  return NextResponse.json(
    {
      location: {
        ...location,
        employee_count: 0,
        manager_count: 0,
      } satisfies LocationWithCounts,
    },
    { status: 201 }
  );
}

export async function PATCH(request: Request) {
  const { response, supabase, profile, scope } =
    await requireAdminAreaContext(request, "locations");

  if (response) return response;

  if (!profile.is_active || profile.role !== "admin") {
    return jsonError("Only active admins can edit locations.", 403);
  }

  let payload: LocationPayload;

  try {
    payload = (await request.json()) as LocationPayload;
  } catch (error) {
    console.error("[locations] Update payload parsing failed", error);
    return jsonError("Unable to update location.", 400);
  }

  const locationId = getLocationId(payload);

  if (!locationId) {
    return jsonError("Choose a location to update.", 400, {
      id: "Choose a location to update.",
    });
  }

  const { values, fieldErrors } = validateLocationPayload(payload);

  if (Object.keys(fieldErrors).length > 0) {
    return jsonError("Fix the highlighted fields.", 400, fieldErrors);
  }

  if (values.storeNumber === null) {
    return jsonError("Fix the highlighted fields.", 400, {
      store_number: "Store Number must be a positive integer.",
    });
  }

  const { data: existingLocation, error: existingLocationError } =
    await supabase
      .from("locations")
      .select("id")
      .eq("id", locationId)
      .eq("company_id", scope.companyId)
      .maybeSingle();

  if (existingLocationError) {
    console.error("[locations] Location lookup failed", existingLocationError);
    return jsonError("Unable to update location.", 500);
  }

  if (!existingLocation) {
    return jsonError("Location not found.", 404);
  }

  const duplicates = await findDuplicateLocation(
    supabase,
    scope.companyId,
    {
      storeNumber: values.storeNumber,
      name: values.name,
    },
    locationId
  );

  if (duplicates.response) return duplicates.response;

  const { data: location, error } = await supabase
    .from("locations")
    .update({
      name: values.name,
      store_number: values.storeNumber,
      is_active: values.isActive,
    })
    .eq("id", locationId)
    .eq("company_id", scope.companyId)
    .select("*")
    .single();

  if (error) {
    console.error("[locations] Location update failed", error);
    return jsonError("Unable to update location.", 500);
  }

  const result = await fetchLocationsWithCounts(supabase, scope.companyId, [
    location.id,
  ]);

  if (result.response) return result.response;

  return NextResponse.json({
    location: result.locations?.[0] ?? {
      ...location,
      employee_count: 0,
      manager_count: 0,
    },
  });
}
