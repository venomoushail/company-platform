import type { User } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { isAdminRole } from "@/lib/auth/roles";
import type { Company, Profile } from "@/types/supabase";

export type CurrentAdminContext = {
  user: User;
  profile: Profile;
  company: Pick<
    Company,
    | "id"
    | "name"
    | "primary_color"
    | "secondary_color"
    | "accent_color"
    | "logo_url"
    | "favicon_url"
  > | null;
  company_id: string;
  role: Profile["role"];
};

export { isAdminRole };

export async function getCurrentUser() {
  const supabase = createBrowserSupabaseClient();

  if (!supabase) return { user: null, error: null, isConfigured: false };

  const { data, error } = await supabase.auth.getUser();

  return { user: data.user, error, isConfigured: true };
}

export async function getCurrentUserProfile(userId: string) {
  const supabase = createBrowserSupabaseClient();

  if (!supabase) return { profile: null, error: null, isConfigured: false };

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  return { profile: data, error, isConfigured: true };
}

export async function getCurrentUserCompany(companyId: string) {
  const supabase = createBrowserSupabaseClient();

  if (!supabase) return { company: null, error: null, isConfigured: false };

  const { data, error } = await supabase
    .from("companies")
    .select(
      "id,name,primary_color,secondary_color,accent_color,logo_url,favicon_url"
    )
    .eq("id", companyId)
    .single();

  return { company: data, error, isConfigured: true };
}

export async function getCurrentAdminContext() {
  const userResult = await getCurrentUser();

  if (!userResult.isConfigured || !userResult.user) {
    return {
      context: null,
      error: userResult.error,
      isConfigured: userResult.isConfigured,
    };
  }

  const profileResult = await getCurrentUserProfile(userResult.user.id);

  if (!profileResult.profile) {
    return {
      context: null,
      error: profileResult.error,
      isConfigured: profileResult.isConfigured,
    };
  }

  const companyResult = await getCurrentUserCompany(
    profileResult.profile.company_id
  );

  return {
    context: {
      user: userResult.user,
      profile: profileResult.profile,
      company: companyResult.company,
      company_id: profileResult.profile.company_id,
      role: profileResult.profile.role,
    } satisfies CurrentAdminContext,
    error: profileResult.error ?? companyResult.error,
    isConfigured: true,
  };
}

export async function signOutCurrentUser() {
  const supabase = createBrowserSupabaseClient();

  if (!supabase) return;

  await supabase.auth.signOut();
}
