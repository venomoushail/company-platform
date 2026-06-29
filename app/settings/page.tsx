"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { useCompanyTheme } from "@/components/theme/CompanyThemeProvider";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Company } from "@/types/supabase";

type CompanySettingsValues = Pick<
  Company,
  | "name"
  | "legal_name"
  | "website"
  | "support_email"
  | "phone"
  | "primary_color"
  | "secondary_color"
  | "accent_color"
  | "logo_url"
  | "favicon_url"
>;

type CompanySettingsErrors = Partial<
  Record<keyof CompanySettingsValues, string>
>;

type CompanySettingsResponse = {
  company: Company;
  canEdit: boolean;
};

const defaultSettingsValues: CompanySettingsValues = {
  name: "",
  legal_name: null,
  website: null,
  support_email: null,
  phone: null,
  primary_color: "#1E3A8A",
  secondary_color: "#FFFFFF",
  accent_color: "#2563EB",
  logo_url: null,
  favicon_url: null,
};

function getReadableErrorMessage(data: unknown, fallback: string) {
  if (!data || typeof data !== "object") return fallback;

  const responseData = data as {
    error?: unknown;
    fieldErrors?: Partial<Record<string, unknown>>;
  };

  if (typeof responseData.error === "string" && responseData.error.trim()) {
    return responseData.error;
  }

  if (responseData.fieldErrors && typeof responseData.fieldErrors === "object") {
    const firstFieldError = Object.values(responseData.fieldErrors).find(
      (error): error is string => typeof error === "string" && error.trim() !== ""
    );

    if (firstFieldError) return firstFieldError;
  }

  return fallback;
}

function getReadableFieldErrors(data: unknown) {
  if (!data || typeof data !== "object") return {};

  const fieldErrors = (data as { fieldErrors?: unknown }).fieldErrors;

  if (!fieldErrors || typeof fieldErrors !== "object") return {};

  return Object.entries(fieldErrors).reduce<CompanySettingsErrors>(
    (errors, [field, value]) => {
      if (typeof value === "string") {
        errors[field as keyof CompanySettingsValues] = value;
      }

      return errors;
    },
    {}
  );
}

function readOptional(value: string | null) {
  return value ?? "";
}

function normalizeFormValues(values: CompanySettingsValues) {
  return {
    ...values,
    legal_name: values.legal_name?.trim() || null,
    website: values.website?.trim() || null,
    support_email: values.support_email?.trim() || null,
    phone: values.phone?.trim() || null,
    logo_url: values.logo_url?.trim() || null,
    favicon_url: values.favicon_url?.trim() || null,
    name: values.name.trim(),
    primary_color: values.primary_color.trim(),
    secondary_color: values.secondary_color.trim(),
    accent_color: values.accent_color.trim(),
  };
}

function validateSettings(values: CompanySettingsValues) {
  const errors: CompanySettingsErrors = {};
  const hexPattern = /^#[0-9a-fA-F]{6}$/;

  if (!values.name.trim()) {
    errors.name = "Company Name is required.";
  }

  for (const field of [
    "primary_color",
    "secondary_color",
    "accent_color",
  ] as const) {
    if (!hexPattern.test(values[field].trim())) {
      errors[field] = "Enter a valid hex color, like #1E3A8A.";
    }
  }

  if (
    values.support_email &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.support_email)
  ) {
    errors.support_email = "Enter a valid support email.";
  }

  return errors;
}

export default function SettingsPage() {
  const { updateCompanyTheme } = useCompanyTheme();
  const [values, setValues] =
    useState<CompanySettingsValues>(defaultSettingsValues);
  const [fieldErrors, setFieldErrors] = useState<CompanySettingsErrors>({});
  const [pageError, setPageError] = useState<string | null>(null);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    const supabase = createBrowserSupabaseClient();

    if (!supabase) {
      setPageError("Supabase environment variables are not configured.");
      setIsFetching(false);
      return;
    }

    setPageError(null);
    setIsFetching(true);

    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();

    if (sessionError || !sessionData.session) {
      setPageError(sessionError?.message || "Sign in to view settings.");
      setIsFetching(false);
      return;
    }

    const response = await fetch("/api/company-settings", {
      headers: {
        Authorization: `Bearer ${sessionData.session.access_token}`,
      },
    });
    const data = await response.json();

    setIsFetching(false);

    if (!response.ok) {
      setPageError(
        getReadableErrorMessage(data, "Unable to load company settings.")
      );
      return;
    }

    const settings = data as CompanySettingsResponse;

    setValues({
      name: settings.company.name,
      legal_name: settings.company.legal_name,
      website: settings.company.website,
      support_email: settings.company.support_email,
      phone: settings.company.phone,
      primary_color: settings.company.primary_color,
      secondary_color: settings.company.secondary_color,
      accent_color: settings.company.accent_color,
      logo_url: settings.company.logo_url,
      favicon_url: settings.company.favicon_url,
    });
    setCanEdit(settings.canEdit);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      fetchSettings();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [fetchSettings]);

  function updateField<Field extends keyof CompanySettingsValues>(
    field: Field,
    value: CompanySettingsValues[Field]
  ) {
    setValues((currentValues) => ({
      ...currentValues,
      [field]: value,
    }));
    setFieldErrors((currentErrors) => ({
      ...currentErrors,
      [field]: undefined,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canEdit) {
      setFormMessage("Only admins can save company settings.");
      return;
    }

    const normalizedValues = normalizeFormValues(values);
    const errors = validateSettings(normalizedValues);

    setFieldErrors(errors);
    setFormMessage(null);

    if (Object.keys(errors).length > 0) return;

    const supabase = createBrowserSupabaseClient();

    if (!supabase) {
      setFormMessage("Supabase environment variables are not configured.");
      return;
    }

    setIsSaving(true);

    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();

    if (sessionError || !sessionData.session) {
      setFormMessage(sessionError?.message || "Sign in before saving settings.");
      setIsSaving(false);
      return;
    }

    const response = await fetch("/api/company-settings", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${sessionData.session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(normalizedValues),
    });
    const data = await response.json();

    setIsSaving(false);

    if (!response.ok) {
      setFieldErrors(getReadableFieldErrors(data));
      setFormMessage(
        getReadableErrorMessage(data, "Unable to save company settings.")
      );
      return;
    }

    const settings = data as CompanySettingsResponse;

    setValues({
      name: settings.company.name,
      legal_name: settings.company.legal_name,
      website: settings.company.website,
      support_email: settings.company.support_email,
      phone: settings.company.phone,
      primary_color: settings.company.primary_color,
      secondary_color: settings.company.secondary_color,
      accent_color: settings.company.accent_color,
      logo_url: settings.company.logo_url,
      favicon_url: settings.company.favicon_url,
    });
    updateCompanyTheme(settings.company);
    setFormMessage("Company settings saved.");
  }

  return (
    <AdminLayout
      title="Settings"
      description="Manage company profile and admin portal branding."
    >
      <div className="space-y-6">
        {pageError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {pageError}
          </div>
        )}

        {!canEdit && !isFetching && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            Managers can view company settings. Only admins can save changes.
          </div>
        )}

        {isFetching ? (
          <section className="rounded-xl bg-white px-6 py-12 text-center shadow-sm">
            <p className="font-semibold text-slate-900">Loading settings</p>
            <p className="mt-2 text-sm text-slate-500">
              Fetching company profile and branding.
            </p>
          </section>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div className="border-b border-slate-200 pb-5">
              <h2 className="text-lg font-bold text-slate-900">
                Company Branding
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                These values control the admin portal theme for your company.
              </p>
            </div>

            {formMessage && (
              <div
                className={`mt-5 rounded-lg border px-4 py-3 text-sm font-medium ${
                  formMessage.includes("saved")
                    ? "border-green-200 bg-green-50 text-green-700"
                    : "border-red-200 bg-red-50 text-red-700"
                }`}
              >
                {formMessage}
              </div>
            )}

            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <SettingsField
                label="Company Name"
                error={fieldErrors.name}
                required
              >
                <input
                  type="text"
                  value={values.name}
                  disabled={!canEdit}
                  onChange={(event) => updateField("name", event.target.value)}
                  className="company-focus w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 disabled:bg-slate-100 disabled:text-slate-500"
                />
              </SettingsField>

              <SettingsField label="Legal Name" error={fieldErrors.legal_name}>
                <input
                  type="text"
                  value={readOptional(values.legal_name)}
                  disabled={!canEdit}
                  onChange={(event) =>
                    updateField("legal_name", event.target.value)
                  }
                  className="company-focus w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 disabled:bg-slate-100 disabled:text-slate-500"
                />
              </SettingsField>

              <SettingsField label="Website" error={fieldErrors.website}>
                <input
                  type="url"
                  value={readOptional(values.website)}
                  disabled={!canEdit}
                  onChange={(event) =>
                    updateField("website", event.target.value)
                  }
                  placeholder="https://example.com"
                  className="company-focus w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 disabled:bg-slate-100 disabled:text-slate-500"
                />
              </SettingsField>

              <SettingsField
                label="Support Email"
                error={fieldErrors.support_email}
              >
                <input
                  type="email"
                  value={readOptional(values.support_email)}
                  disabled={!canEdit}
                  onChange={(event) =>
                    updateField("support_email", event.target.value)
                  }
                  className="company-focus w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 disabled:bg-slate-100 disabled:text-slate-500"
                />
              </SettingsField>

              <SettingsField label="Phone" error={fieldErrors.phone}>
                <input
                  type="tel"
                  value={readOptional(values.phone)}
                  disabled={!canEdit}
                  onChange={(event) => updateField("phone", event.target.value)}
                  className="company-focus w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 disabled:bg-slate-100 disabled:text-slate-500"
                />
              </SettingsField>
            </div>

            <div className="mt-8 border-t border-slate-200 pt-6">
              <h3 className="text-base font-bold text-slate-900">
                Theme Colors
              </h3>
              <div className="mt-4 grid gap-5 md:grid-cols-3">
                <ColorField
                  label="Primary Color"
                  value={values.primary_color}
                  error={fieldErrors.primary_color}
                  disabled={!canEdit}
                  onChange={(value) => updateField("primary_color", value)}
                />
                <ColorField
                  label="Secondary Color"
                  value={values.secondary_color}
                  error={fieldErrors.secondary_color}
                  disabled={!canEdit}
                  onChange={(value) => updateField("secondary_color", value)}
                />
                <ColorField
                  label="Accent Color"
                  value={values.accent_color}
                  error={fieldErrors.accent_color}
                  disabled={!canEdit}
                  onChange={(value) => updateField("accent_color", value)}
                />
              </div>
            </div>

            <div className="mt-8 border-t border-slate-200 pt-6">
              <h3 className="text-base font-bold text-slate-900">Logo Assets</h3>
              {/* TODO: Replace URL fields with Supabase Storage uploads for company logos. */}
              {/* TODO: Add favicon upload and image validation once storage policies are configured. */}
              <div className="mt-4 grid gap-5 md:grid-cols-2">
                <SettingsField label="Logo URL" error={fieldErrors.logo_url}>
                  <input
                    type="url"
                    value={readOptional(values.logo_url)}
                    disabled={!canEdit}
                    onChange={(event) =>
                      updateField("logo_url", event.target.value)
                    }
                    placeholder="https://example.com/logo.png"
                    className="company-focus w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 disabled:bg-slate-100 disabled:text-slate-500"
                  />
                </SettingsField>

                <SettingsField
                  label="Favicon URL"
                  error={fieldErrors.favicon_url}
                >
                  <input
                    type="url"
                    value={readOptional(values.favicon_url)}
                    disabled={!canEdit}
                    onChange={(event) =>
                      updateField("favicon_url", event.target.value)
                    }
                    placeholder="https://example.com/favicon.ico"
                    className="company-focus w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 disabled:bg-slate-100 disabled:text-slate-500"
                  />
                </SettingsField>
              </div>
            </div>

            <div className="mt-8 flex justify-end border-t border-slate-200 pt-5">
              <button
                type="submit"
                disabled={!canEdit || isSaving}
                className="company-primary-button rounded-lg px-4 py-2 text-sm font-semibold"
              >
                {isSaving ? "Saving..." : "Save Settings"}
              </button>
            </div>
          </form>
        )}
      </div>
    </AdminLayout>
  );
}

function SettingsField({
  label,
  error,
  required = false,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-slate-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      {children}
      {error && <p className="mt-2 text-sm font-medium text-red-600">{error}</p>}
    </div>
  );
}

function ColorField({
  label,
  value,
  error,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  error?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <SettingsField label={label} error={error} required>
      <div className="flex gap-3">
        <input
          type="color"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          className="h-12 w-14 rounded-lg border border-slate-300 bg-white p-1 disabled:bg-slate-100"
          aria-label={label}
        />
        <input
          type="text"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="company-focus min-w-0 flex-1 rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 disabled:bg-slate-100 disabled:text-slate-500"
        />
      </div>
    </SettingsField>
  );
}
