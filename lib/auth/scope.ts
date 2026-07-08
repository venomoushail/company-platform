import "server-only";

import type { Profile } from "@/types/supabase";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export type DataScope = {
  profile: Profile;
  role: Profile["role"];
  companyId: string;
  userId: string;
  locationId: string | null;
  allowedLocationIds: string[] | null;
  locationIds: string[];
  canAccessAllLocations: boolean;
  isAdmin: boolean;
  isManager: boolean;
  isEmployee: boolean;
};

export function getDataScope(profile: Profile): DataScope {
  const isAdmin = profile.role === "admin";
  const isManager = profile.role === "manager";
  const locationIds = isManager && profile.location_id ? [profile.location_id] : [];
  const allowedLocationIds = isAdmin ? null : locationIds;

  return {
    profile,
    role: profile.role,
    companyId: profile.company_id,
    userId: profile.id,
    locationId: profile.location_id,
    allowedLocationIds,
    locationIds,
    canAccessAllLocations: isAdmin,
    isAdmin,
    isManager,
    isEmployee: profile.role === "employee",
  };
}

export async function getDataScopeForProfile(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  profile: Profile
): Promise<DataScope> {
  if (profile.role !== "manager") return getDataScope(profile);

  const { data, error } = await supabase
    .from("manager_locations")
    .select("location_id")
    .eq("manager_id", profile.id)
    .eq("company_id", profile.company_id);

  if (error) {
    console.error("[auth-scope] Manager locations lookup failed", error);
  }

  const managedLocationIds = Array.from(
    new Set((data ?? []).map((row) => row.location_id).filter(Boolean))
  );
  const locationIds =
    managedLocationIds.length > 0
      ? managedLocationIds
      : profile.location_id
        ? [profile.location_id]
        : [];

  return {
    profile,
    role: profile.role,
    companyId: profile.company_id,
    userId: profile.id,
    locationId: profile.location_id,
    allowedLocationIds: locationIds,
    locationIds,
    canAccessAllLocations: false,
    isAdmin: false,
    isManager: true,
    isEmployee: false,
  };
}

export function canAccessLocation(scope: DataScope, locationId: string | null) {
  if (scope.canAccessAllLocations) return true;
  if (scope.isManager) return Boolean(locationId && scope.locationIds.includes(locationId));

  return false;
}

export function canAccessEmployee(
  scope: DataScope,
  employee: Pick<Profile, "id" | "location_id" | "company_id">
) {
  if (employee.company_id !== scope.companyId) return false;
  if (scope.canAccessAllLocations) return true;
  if (scope.isManager) return canAccessLocation(scope, employee.location_id);

  return employee.id === scope.userId;
}
