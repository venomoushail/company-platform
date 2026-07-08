"use client";

import Link from "next/link";
import {
  FormEvent,
  ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import AdminLayout from "@/components/layout/AdminLayout";
import { useCompanyTheme } from "@/components/theme/CompanyThemeProvider";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Company, Location, Position } from "@/types/supabase";

type SettingsTab = "company" | "branding" | "locations" | "positions";

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

type LocationWithCounts = Location & {
  employee_count: number;
  manager_count: number;
};

type PositionWithCounts = Position & {
  employee_count: number;
  assigned_training_count: number;
};

type ResourceFieldErrors = Partial<Record<string, string>>;

type ConfirmationState =
  | {
      kind: "location";
      id: string;
      name: string;
      nextIsActive: boolean;
    }
  | {
      kind: "position";
      id: string;
      name: string;
      nextIsActive: boolean;
    }
  | null;

const tabs: { id: SettingsTab; label: string }[] = [
  { id: "company", label: "Company" },
  { id: "branding", label: "Branding" },
  { id: "locations", label: "Locations" },
  { id: "positions", label: "Positions" },
];

function isSettingsTab(tab: string | null): tab is SettingsTab {
  return tabs.some((settingsTab) => settingsTab.id === tab)
}

function getInitialSettingsTab() {
  if (typeof window === "undefined") return "company";

  const tab = new URLSearchParams(window.location.search).get("tab");

  return isSettingsTab(tab) ? tab : "company";
}

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

const emptyLocationValues = {
  id: null as string | null,
  store_number: "",
  name: "",
  is_active: true,
};

const emptyPositionValues = {
  id: null as string | null,
  name: "",
  is_active: true,
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

function getReadableFieldErrors<T extends Record<string, string | null | boolean>>(
  data: unknown
) {
  if (!data || typeof data !== "object") return {};

  const fieldErrors = (data as { fieldErrors?: unknown }).fieldErrors;

  if (!fieldErrors || typeof fieldErrors !== "object") return {};

  return Object.entries(fieldErrors).reduce<Partial<Record<keyof T, string>>>(
    (errors, [field, value]) => {
      if (typeof value === "string") {
        errors[field as keyof T] = value;
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

function validateLocationForm(values: typeof emptyLocationValues) {
  const errors: ResourceFieldErrors = {};

  if (!/^\d+$/.test(values.store_number.trim()) || Number(values.store_number) < 1) {
    errors.store_number = "Store Number must be a positive integer.";
  }

  if (!values.name.trim()) {
    errors.name = "Location name is required.";
  }

  return errors;
}

function validatePositionForm(values: typeof emptyPositionValues) {
  const errors: ResourceFieldErrors = {};

  if (!values.name.trim()) {
    errors.name = "Position name is required.";
  }

  return errors;
}

async function getAuthHeaders() {
  const supabase = createBrowserSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase environment variables are not configured.");
  }

  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session?.access_token) {
    throw new Error(error?.message || "Sign in before managing settings.");
  }

  return {
    Authorization: `Bearer ${data.session.access_token}`,
  };
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <AdminLayout
          title="Settings"
          description="Manage company profile, branding, locations, and positions."
        >
          <LoadingCard title="Loading settings" body="Preparing settings." />
        </AdminLayout>
      }
    >
      <SettingsContent />
    </Suspense>
  );
}

function SettingsContent() {
  const searchParams = useSearchParams();
  const { updateCompanyTheme } = useCompanyTheme();
  const [activeTab, setActiveTab] = useState<SettingsTab>(getInitialSettingsTab);
  const [values, setValues] =
    useState<CompanySettingsValues>(defaultSettingsValues);
  const [fieldErrors, setFieldErrors] = useState<CompanySettingsErrors>({});
  const [pageError, setPageError] = useState<string | null>(null);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [canEditCompany, setCanEditCompany] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    setPageError(null);
    setIsFetching(true);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch("/api/company-settings", { headers });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          getReadableErrorMessage(data, "Unable to load company settings.")
        );
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
      setCanEditCompany(settings.canEdit);
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "Unable to load company settings."
      );
    } finally {
      setIsFetching(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      fetchSettings();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [fetchSettings]);

  useEffect(() => {
    const tab = searchParams.get("tab");

    if (isSettingsTab(tab)) {
      const timeoutId = window.setTimeout(() => {
        setActiveTab(tab);
      }, 0);

      return () => window.clearTimeout(timeoutId);
    }
  }, [searchParams]);

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

  async function handleCompanySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canEditCompany) {
      setFormMessage("Only admins can save company settings.");
      return;
    }

    const normalizedValues = normalizeFormValues(values);
    const errors = validateSettings(normalizedValues);

    setFieldErrors(errors);
    setFormMessage(null);

    if (Object.keys(errors).length > 0) return;

    setIsSaving(true);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch("/api/company-settings", {
        method: "PATCH",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(normalizedValues),
      });
      const data = await response.json();

      if (!response.ok) {
        setFieldErrors(getReadableFieldErrors<CompanySettingsValues>(data));
        throw new Error(
          getReadableErrorMessage(data, "Unable to save company settings.")
        );
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
    } catch (error) {
      setFormMessage(
        error instanceof Error ? error.message : "Unable to save company settings."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AdminLayout
      title="Settings"
      description="Manage company profile, branding, locations, and positions."
    >
      <div className="space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  setFormMessage(null);
                }}
                className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
                  activeTab === tab.id
                    ? "company-primary-button"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {pageError && (
          <Alert tone="error">{pageError}</Alert>
        )}

        {!canEditCompany && !isFetching && (
          <Alert tone="warning">
            Managers can view settings. Only admins can save changes.
          </Alert>
        )}

        {isFetching && (activeTab === "company" || activeTab === "branding") ? (
          <LoadingCard title="Loading settings" body="Fetching company settings." />
        ) : (
          <>
            {activeTab === "company" && (
              <CompanySettingsForm
                values={values}
                fieldErrors={fieldErrors}
                canEdit={canEditCompany}
                isSaving={isSaving}
                formMessage={formMessage}
                onSubmit={handleCompanySubmit}
                updateField={updateField}
              />
            )}

            {activeTab === "branding" && (
              <BrandingSettingsForm
                values={values}
                fieldErrors={fieldErrors}
                canEdit={canEditCompany}
                isSaving={isSaving}
                formMessage={formMessage}
                onSubmit={handleCompanySubmit}
                updateField={updateField}
              />
            )}
          </>
        )}

        {activeTab === "locations" && <LocationsPanel />}
        {activeTab === "positions" && <PositionsPanel />}
      </div>
    </AdminLayout>
  );
}

function CompanySettingsForm({
  values,
  fieldErrors,
  canEdit,
  isSaving,
  formMessage,
  onSubmit,
  updateField,
}: {
  values: CompanySettingsValues;
  fieldErrors: CompanySettingsErrors;
  canEdit: boolean;
  isSaving: boolean;
  formMessage: string | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  updateField: <Field extends keyof CompanySettingsValues>(
    field: Field,
    value: CompanySettingsValues[Field]
  ) => void;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <SectionHeader
        title="Company"
        body="Update the public company profile details shown across the admin portal."
      />

      {formMessage && (
        <Alert tone={formMessage.includes("saved") ? "success" : "error"}>
          {formMessage}
        </Alert>
      )}

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <SettingsField label="Company Name" error={fieldErrors.name} required>
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
            onChange={(event) => updateField("legal_name", event.target.value)}
            className="company-focus w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 disabled:bg-slate-100 disabled:text-slate-500"
          />
        </SettingsField>

        <SettingsField label="Website" error={fieldErrors.website}>
          <input
            type="url"
            value={readOptional(values.website)}
            disabled={!canEdit}
            onChange={(event) => updateField("website", event.target.value)}
            placeholder="https://example.com"
            className="company-focus w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 disabled:bg-slate-100 disabled:text-slate-500"
          />
        </SettingsField>

        <SettingsField label="Support Email" error={fieldErrors.support_email}>
          <input
            type="email"
            value={readOptional(values.support_email)}
            disabled={!canEdit}
            onChange={(event) => updateField("support_email", event.target.value)}
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

      <FormActions canEdit={canEdit} isSaving={isSaving} label="Save Company" />
    </form>
  );
}

function BrandingSettingsForm({
  values,
  fieldErrors,
  canEdit,
  isSaving,
  formMessage,
  onSubmit,
  updateField,
}: {
  values: CompanySettingsValues;
  fieldErrors: CompanySettingsErrors;
  canEdit: boolean;
  isSaving: boolean;
  formMessage: string | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  updateField: <Field extends keyof CompanySettingsValues>(
    field: Field,
    value: CompanySettingsValues[Field]
  ) => void;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <SectionHeader
        title="Branding"
        body="Control theme colors and logo assets for the admin portal."
      />

      {formMessage && (
        <Alert tone={formMessage.includes("saved") ? "success" : "error"}>
          {formMessage}
        </Alert>
      )}

      <div className="mt-6 grid gap-5 md:grid-cols-3">
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

      <div className="mt-8 grid gap-5 md:grid-cols-2">
        <SettingsField label="Logo URL" error={fieldErrors.logo_url}>
          <input
            type="url"
            value={readOptional(values.logo_url)}
            disabled={!canEdit}
            onChange={(event) => updateField("logo_url", event.target.value)}
            placeholder="https://example.com/logo.png"
            className="company-focus w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 disabled:bg-slate-100 disabled:text-slate-500"
          />
        </SettingsField>

        <SettingsField label="Favicon URL" error={fieldErrors.favicon_url}>
          <input
            type="url"
            value={readOptional(values.favicon_url)}
            disabled={!canEdit}
            onChange={(event) => updateField("favicon_url", event.target.value)}
            placeholder="https://example.com/favicon.ico"
            className="company-focus w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 disabled:bg-slate-100 disabled:text-slate-500"
          />
        </SettingsField>
      </div>

      <FormActions canEdit={canEdit} isSaving={isSaving} label="Save Branding" />
    </form>
  );
}

function LocationsPanel() {
  const [locations, setLocations] = useState<LocationWithCounts[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formValues, setFormValues] = useState(emptyLocationValues);
  const [fieldErrors, setFieldErrors] = useState<ResourceFieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationState>(null);

  const isEditMode = Boolean(formValues.id);

  const fetchLocations = useCallback(async (clearMessage = true) => {
    setIsFetching(true);
    if (clearMessage) setMessage(null);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch("/api/locations", { headers });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(getReadableErrorMessage(data, "Unable to load locations."));
      }

      setLocations(data.locations ?? []);
      setCanEdit(Boolean(data.canEdit));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load locations.");
    } finally {
      setIsFetching(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      fetchLocations();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [fetchLocations]);

  function editLocation(location: LocationWithCounts) {
    setFormValues({
      id: location.id,
      store_number: String(location.store_number),
      name: location.name,
      is_active: location.is_active,
    });
    setFieldErrors({});
    setMessage(null);
  }

  function resetForm() {
    setFormValues(emptyLocationValues);
    setFieldErrors({});
  }

  async function saveLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const errors = validateLocationForm(formValues);
    setFieldErrors(errors);
    setMessage(null);

    if (Object.keys(errors).length > 0) return;

    setIsSaving(true);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch("/api/locations", {
        method: isEditMode ? "PATCH" : "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: formValues.id,
          store_number: Number(formValues.store_number),
          name: formValues.name,
          is_active: formValues.is_active,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setFieldErrors(getReadableFieldErrors<typeof emptyLocationValues>(data));
        throw new Error(getReadableErrorMessage(data, "Unable to save location."));
      }

      setMessage(isEditMode ? "Location updated." : "Location added.");
      resetForm();
      await fetchLocations(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save location.");
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleLocation(location: LocationWithCounts, nextIsActive: boolean) {
    setConfirmation(null);
    setIsSaving(true);
    setMessage(null);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch("/api/locations", {
        method: "PATCH",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: location.id,
          store_number: location.store_number,
          name: location.name,
          is_active: nextIsActive,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          getReadableErrorMessage(data, "Unable to update location status.")
        );
      }

      setMessage(nextIsActive ? "Location reactivated." : "Location deactivated.");
      await fetchLocations(false);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to update location status."
      );
    } finally {
      setIsSaving(false);
    }
  }

  const confirmationLocation = confirmation?.kind === "location"
    ? locations.find((location) => location.id === confirmation.id)
    : null;

  return (
    <>
      <ManagementShell
        title="Locations"
        body="Manage company stores and branches without removing historical assignments."
        canEdit={canEdit}
        isFetching={isFetching}
        message={message}
      >
        {canEdit && (
          <form onSubmit={saveLocation} className="border-b border-slate-200 p-5">
            <div className="grid gap-4 md:grid-cols-[160px_minmax(220px,1fr)_160px_auto] md:items-start">
              <SettingsField
                label="Store Number"
                error={fieldErrors.store_number}
                required
              >
                <input
                  type="number"
                  min="1"
                  value={formValues.store_number}
                  onChange={(event) =>
                    setFormValues((current) => ({
                      ...current,
                      store_number: event.target.value,
                    }))
                  }
                  className="company-focus w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900"
                />
              </SettingsField>

              <SettingsField label="Location Name" error={fieldErrors.name} required>
                <input
                  type="text"
                  value={formValues.name}
                  onChange={(event) =>
                    setFormValues((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  className="company-focus w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900"
                />
              </SettingsField>

              <label className="mt-7 flex h-12 items-center gap-3 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={formValues.is_active}
                  onChange={(event) =>
                    setFormValues((current) => ({
                      ...current,
                      is_active: event.target.checked,
                    }))
                  }
                  className="h-4 w-4"
                />
                Active
              </label>

              <div className="mt-7 flex gap-2">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="company-primary-button h-12 rounded-lg px-4 text-sm font-semibold"
                >
                  {isSaving ? "Saving..." : isEditMode ? "Save" : "Add Location"}
                </button>
                {isEditMode && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="h-12 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Store #</th>
                <th className="px-5 py-3">Location</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Employees</th>
                <th className="px-5 py-3">Managers</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {locations.map((location) => (
                <tr
                  key={location.id}
                  tabIndex={0}
                  onClick={() => {
                    window.location.href = `/settings/locations/${location.id}`;
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      window.location.href = `/settings/locations/${location.id}`;
                    }
                  }}
                  className="cursor-pointer hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
                >
                  <td className="px-5 py-4 font-semibold text-slate-900">
                    {location.store_number}
                  </td>
                  <td className="px-5 py-4 text-slate-700">{location.name}</td>
                  <td className="px-5 py-4">
                    <StatusBadge isActive={location.is_active} />
                  </td>
                  <td className="px-5 py-4 text-slate-700">
                    {location.employee_count}
                  </td>
                  <td className="px-5 py-4 text-slate-700">
                    {location.manager_count}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-2">
                      <Link
                        href={`/settings/locations/${location.id}`}
                        onClick={(event) => event.stopPropagation()}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        View Details
                      </Link>
                      {canEdit && (
                        <>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              editLocation(location);
                            }}
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={(event) => {
                              event.stopPropagation();
                              return location.is_active
                                ? setConfirmation({
                                    kind: "location",
                                    id: location.id,
                                    name: location.name,
                                    nextIsActive: false,
                                  })
                                : toggleLocation(location, true);
                            }}
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                          >
                            {location.is_active ? "Deactivate" : "Reactivate"}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {locations.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-10 text-center text-sm font-medium text-slate-500"
                  >
                    No locations have been added yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </ManagementShell>

      {confirmation?.kind === "location" && confirmationLocation && (
        <ConfirmationModal
          title="Deactivate location?"
          body={`${confirmation.name} will no longer appear for new employee creation or new training filters. Existing employee assignments will stay readable.`}
          confirmLabel="Deactivate"
          onCancel={() => setConfirmation(null)}
          onConfirm={() => toggleLocation(confirmationLocation, false)}
        />
      )}
    </>
  );
}

function PositionsPanel() {
  const [positions, setPositions] = useState<PositionWithCounts[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formValues, setFormValues] = useState(emptyPositionValues);
  const [fieldErrors, setFieldErrors] = useState<ResourceFieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationState>(null);

  const isEditMode = Boolean(formValues.id);

  const fetchPositions = useCallback(async (clearMessage = true) => {
    setIsFetching(true);
    if (clearMessage) setMessage(null);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch("/api/positions", { headers });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(getReadableErrorMessage(data, "Unable to load positions."));
      }

      setPositions(data.positions ?? []);
      setCanEdit(Boolean(data.canEdit));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load positions.");
    } finally {
      setIsFetching(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      fetchPositions();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [fetchPositions]);

  function editPosition(position: PositionWithCounts) {
    setFormValues({
      id: position.id,
      name: position.name,
      is_active: position.is_active,
    });
    setFieldErrors({});
    setMessage(null);
  }

  function resetForm() {
    setFormValues(emptyPositionValues);
    setFieldErrors({});
  }

  async function savePosition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const errors = validatePositionForm(formValues);
    setFieldErrors(errors);
    setMessage(null);

    if (Object.keys(errors).length > 0) return;

    setIsSaving(true);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch("/api/positions", {
        method: isEditMode ? "PATCH" : "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formValues),
      });
      const data = await response.json();

      if (!response.ok) {
        setFieldErrors(getReadableFieldErrors<typeof emptyPositionValues>(data));
        throw new Error(getReadableErrorMessage(data, "Unable to save position."));
      }

      setMessage(isEditMode ? "Position updated." : "Position added.");
      resetForm();
      await fetchPositions(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save position.");
    } finally {
      setIsSaving(false);
    }
  }

  async function togglePosition(position: PositionWithCounts, nextIsActive: boolean) {
    setConfirmation(null);
    setIsSaving(true);
    setMessage(null);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch("/api/positions", {
        method: "PATCH",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: position.id,
          name: position.name,
          is_active: nextIsActive,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          getReadableErrorMessage(data, "Unable to update position status.")
        );
      }

      setMessage(nextIsActive ? "Position reactivated." : "Position deactivated.");
      await fetchPositions(false);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to update position status."
      );
    } finally {
      setIsSaving(false);
    }
  }

  const confirmationPosition = confirmation?.kind === "position"
    ? positions.find((position) => position.id === confirmation.id)
    : null;

  return (
    <>
      <ManagementShell
        title="Positions"
        body="Manage company job positions without changing system roles."
        canEdit={canEdit}
        isFetching={isFetching}
        message={message}
      >
        {canEdit && (
          <form onSubmit={savePosition} className="border-b border-slate-200 p-5">
            <div className="grid gap-4 md:grid-cols-[minmax(220px,1fr)_160px_auto] md:items-start">
              <SettingsField label="Position Name" error={fieldErrors.name} required>
                <input
                  type="text"
                  value={formValues.name}
                  onChange={(event) =>
                    setFormValues((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  className="company-focus w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900"
                />
              </SettingsField>

              <label className="mt-7 flex h-12 items-center gap-3 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={formValues.is_active}
                  onChange={(event) =>
                    setFormValues((current) => ({
                      ...current,
                      is_active: event.target.checked,
                    }))
                  }
                  className="h-4 w-4"
                />
                Active
              </label>

              <div className="mt-7 flex gap-2">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="company-primary-button h-12 rounded-lg px-4 text-sm font-semibold"
                >
                  {isSaving ? "Saving..." : isEditMode ? "Save" : "Add Position"}
                </button>
                {isEditMode && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="h-12 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Position</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Employees</th>
                <th className="px-5 py-3">Assigned Trainings</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {positions.map((position) => (
                <tr
                  key={position.id}
                  tabIndex={0}
                  onClick={() => {
                    window.location.href = `/settings/positions/${position.id}`;
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      window.location.href = `/settings/positions/${position.id}`;
                    }
                  }}
                  className="cursor-pointer hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
                >
                  <td className="px-5 py-4 font-semibold text-slate-900">
                    {position.name}
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge isActive={position.is_active} />
                  </td>
                  <td className="px-5 py-4 text-slate-700">
                    {position.employee_count}
                  </td>
                  <td className="px-5 py-4 text-slate-700">
                    {position.assigned_training_count}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-2">
                      <Link
                        href={`/settings/positions/${position.id}`}
                        onClick={(event) => event.stopPropagation()}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        View Details
                      </Link>
                      {canEdit && (
                        <>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            editPosition(position);
                          }}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={(event) => {
                            event.stopPropagation();
                            return position.is_active
                              ? setConfirmation({
                                  kind: "position",
                                  id: position.id,
                                  name: position.name,
                                  nextIsActive: false,
                                })
                              : togglePosition(position, true);
                          }}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                        >
                          {position.is_active ? "Deactivate" : "Reactivate"}
                        </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {positions.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-10 text-center text-sm font-medium text-slate-500"
                  >
                    No positions have been added yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </ManagementShell>

      {confirmation?.kind === "position" && confirmationPosition && (
        <ConfirmationModal
          title="Deactivate position?"
          body={`${confirmation.name} will no longer appear for new employee assignment or new training targeting. Existing assignments will stay readable.`}
          confirmLabel="Deactivate"
          onCancel={() => setConfirmation(null)}
          onConfirm={() => togglePosition(confirmationPosition, false)}
        />
      )}
    </>
  );
}

function ManagementShell({
  title,
  body,
  canEdit,
  isFetching,
  message,
  children,
}: {
  title: string;
  body: string;
  canEdit: boolean;
  isFetching: boolean;
  message: string | null;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-6">
        <SectionHeader title={title} body={body} />
        {!canEdit && !isFetching && (
          <p className="mt-3 text-sm font-medium text-amber-700">
            Managers can view {title.toLowerCase()}. Only admins can make changes.
          </p>
        )}
        {message && (
          <div className="mt-4">
            <Alert
              tone={
                message.includes("added") ||
                message.includes("updated") ||
                message.includes("deactivated") ||
                message.includes("reactivated")
                  ? "success"
                  : "error"
              }
            >
              {message}
            </Alert>
          </div>
        )}
      </div>

      {isFetching ? (
        <div className="px-6 py-12 text-center">
          <p className="font-semibold text-slate-900">Loading {title.toLowerCase()}</p>
          <p className="mt-2 text-sm text-slate-500">Fetching company records.</p>
        </div>
      ) : (
        children
      )}
    </section>
  );
}

function ConfirmationModal({
  title,
  body,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{body}</p>
    </div>
  );
}

function FormActions({
  canEdit,
  isSaving,
  label,
}: {
  canEdit: boolean;
  isSaving: boolean;
  label: string;
}) {
  return (
    <div className="mt-8 flex justify-end border-t border-slate-200 pt-5">
      <button
        type="submit"
        disabled={!canEdit || isSaving}
        className="company-primary-button rounded-lg px-4 py-2 text-sm font-semibold"
      >
        {isSaving ? "Saving..." : label}
      </button>
    </div>
  );
}

function Alert({
  tone,
  children,
}: {
  tone: "success" | "error" | "warning";
  children: ReactNode;
}) {
  const toneClass =
    tone === "success"
      ? "border-green-200 bg-green-50 text-green-700"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-red-200 bg-red-50 text-red-700";

  return (
    <div className={`rounded-lg border px-4 py-3 text-sm font-medium ${toneClass}`}>
      {children}
    </div>
  );
}

function LoadingCard({ title, body }: { title: string; body: string }) {
  return (
    <section className="rounded-xl bg-white px-6 py-12 text-center shadow-sm">
      <p className="font-semibold text-slate-900">{title}</p>
      <p className="mt-2 text-sm text-slate-500">{body}</p>
    </section>
  );
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
        isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"
      }`}
    >
      {isActive ? "Active" : "Inactive"}
    </span>
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
  children: ReactNode;
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
