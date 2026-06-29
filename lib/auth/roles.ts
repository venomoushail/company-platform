import type { Profile } from "@/types/supabase";

export function isAdminRole(role: Profile["role"]) {
  return role === "admin" || role === "manager";
}
