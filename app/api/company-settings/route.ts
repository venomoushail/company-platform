import { NextResponse } from "next/server";
import { getAdminContextForUserId } from "@/lib/auth/server";
import { isAdminRole } from "@/lib/auth/roles";
import {
  createAdminSupabaseClient,
  getSupabaseAdminConfig,
} from "@/lib/supabase/admin";
import type { Company } from "@/types/supabase";

export const dynamic = "force-dynamic";

type CompanySettingsPayload = {
  name?: unknown;
  legal_name?: unknown;
  website?: unknown;
  support_email?: unknown;
  phone?: unknown;
  primary_color?: unknown;
  secondary_color?: unknown;
  accent_color?: unknown;
  logo_url?: unknown;
  favicon_url?: unknown;
};

type CompanySettingsField = keyof CompanySettingsPayload;

function jsonError(
  message: string,
  status: number,
  fieldErrors: Partial<Record<CompanySettingsField, string>> = {}
) {
  return NextResponse.json({ error: message, fieldErrors }, { status });
}

function getBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) return null;

  return authHeader.slice("Bearer ".length).trim();
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readNullableString(value: unknown) {
  const stringValue = readString(value);

  return stringValue || null;
}

function isValidHexColor(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

function isValidOptionalUrl(value: string | null) {
  if (!value) return true;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function validateCompanySettingsPayload(payload: CompanySettingsPayload) {
  const fieldErrors: Partial<Record<CompanySettingsField, string>> = {};
  const values = {
    name: readString(payload.name),
    legal_name: readNullableString(payload.legal_name),
    website: readNullableString(payload.website),
    support_email: readNullableString(payload.support_email),
    phone: readNullableString(payload.phone),
    primary_color: readString(payload.primary_color),
    secondary_color: readString(payload.secondary_color),
    accent_color: readString(payload.accent_color),
    logo_url: readNullableString(payload.logo_url),
    favicon_url: readNullableString(payload.favicon_url),
  };

  if (!values.name) {
    fieldErrors.name = "Company Name is required.";
  }

  for (const colorField of [
    "primary_color",
    "secondary_color",
    "accent_color",
  ] as const) {
    if (!isValidHexColor(values[colorField])) {
      fieldErrors[colorField] = "Enter a valid hex color, like #1E3A8A.";
    }
  }

  if (
    values.support_email &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.support_email)
  ) {
    fieldErrors.support_email = "Enter a valid support email.";
  }

  if (!isValidOptionalUrl(values.website)) {
    fieldErrors.website = "Enter a valid website URL.";
  }

  if (!isValidOptionalUrl(values.logo_url)) {
    fieldErrors.logo_url = "Enter a valid logo URL.";
  }

  if (!isValidOptionalUrl(values.favicon_url)) {
    fieldErrors.favicon_url = "Enter a valid favicon URL.";
  }

  return { values, fieldErrors };
}

async function requireAdminContext(request: Request) {
  const { url, serviceRoleKey } = getSupabaseAdminConfig();

  if (!url || !serviceRoleKey) {
    return {
      response: jsonError("Supabase admin environment is not configured.", 500),
      supabase: null,
      profile: null,
    };
  }

  const token = getBearerToken(request);

  if (!token) {
    return {
      response: jsonError("You must be signed in to access settings.", 401),
      supabase: null,
      profile: null,
    };
  }

  const supabase = createAdminSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);

  if (userError || !userData.user) {
    return {
      response: jsonError("Your session is invalid or expired.", 401),
      supabase: null,
      profile: null,
    };
  }

  const { profile } = await getAdminContextForUserId(userData.user.id);

  if (!profile || !profile.is_active || !isAdminRole(profile.role)) {
    return {
      response: jsonError("You do not have access to settings.", 403),
      supabase: null,
      profile: null,
    };
  }

  return { response: null, supabase, profile };
}

function getCompanySelect() {
  return [
    "id",
    "name",
    "legal_name",
    "logo_url",
    "favicon_url",
    "primary_color",
    "secondary_color",
    "accent_color",
    "website",
    "support_email",
    "phone",
    "is_active",
  ].join(",");
}

export async function GET(request: Request) {
  const { response, supabase, profile } = await requireAdminContext(request);

  if (response) return response;

  const { data: company, error } = await supabase
    .from("companies")
    .select(getCompanySelect())
    .eq("id", profile.company_id)
    .single();

  if (error) {
    console.error("[company-settings] Company fetch failed", error);
    return jsonError("Unable to load company settings.", 500);
  }

  return NextResponse.json({
    company,
    canEdit: profile.role === "admin",
  });
}

export async function PATCH(request: Request) {
  const { response, supabase, profile } = await requireAdminContext(request);

  if (response) return response;

  if (profile.role !== "admin") {
    return jsonError("Only admins can save company settings.", 403);
  }

  let payload: CompanySettingsPayload;

  try {
    payload = (await request.json()) as CompanySettingsPayload;
  } catch (error) {
    console.error("[company-settings] Payload parsing failed", error);
    return jsonError("Unable to save company settings.", 400);
  }

  const { values, fieldErrors } = validateCompanySettingsPayload(payload);

  if (Object.keys(fieldErrors).length > 0) {
    return jsonError("Fix the highlighted fields.", 400, fieldErrors);
  }

  const update: Partial<Company> = {
    name: values.name,
    legal_name: values.legal_name,
    website: values.website,
    support_email: values.support_email,
    phone: values.phone,
    primary_color: values.primary_color,
    secondary_color: values.secondary_color,
    accent_color: values.accent_color,
    logo_url: values.logo_url,
    favicon_url: values.favicon_url,
  };

  const { data: company, error } = await supabase
    .from("companies")
    .update(update)
    .eq("id", profile.company_id)
    .select(getCompanySelect())
    .single();

  if (error) {
    console.error("[company-settings] Company update failed", error);
    return jsonError("Unable to save company settings.", 500);
  }

  return NextResponse.json({
    company,
    canEdit: true,
  });
}
