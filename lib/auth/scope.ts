import "server-only";

import type { Profile } from "@/types/supabase";

export type DataScope = {
  profile: Profile;
  role: Profile["role"];
  companyId: string;
  userId: string;
  locationId: string | null;
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

  return {
    profile,
    role: profile.role,
    companyId: profile.company_id,
    userId: profile.id,
    locationId: profile.location_id,
    locationIds,
    canAccessAllLocations: isAdmin,
    isAdmin,
    isManager,
    isEmployee: profile.role === "employee",
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
