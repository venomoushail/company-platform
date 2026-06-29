import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isAdminRole } from "@/lib/auth/roles";

export async function getProfileByUserId(userId: string) {
  const supabase = createAdminSupabaseClient();

  return supabase.from("profiles").select("*").eq("id", userId).single();
}

export async function getAdminContextForUserId(userId: string) {
  const { data: profile, error } = await getProfileByUserId(userId);

  if (error || !profile || !profile.is_active || !isAdminRole(profile.role)) {
    return { profile: null, company_id: null, role: null, error };
  }

  return {
    profile,
    company_id: profile.company_id,
    role: profile.role,
    error: null,
  };
}
