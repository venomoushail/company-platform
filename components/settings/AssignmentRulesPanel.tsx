"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type {
  Location,
  Position,
  TrainingAssignmentRule,
  TrainingAssignmentRuleType,
  TrainingModule,
} from "@/types/supabase";

type RuleFormValues = {
  id: string | null;
  module_id: string;
  rule_type: TrainingAssignmentRuleType;
  position_id: string;
  location_id: string;
  assign_on_hire: boolean;
  assign_on_position_change: boolean;
  assign_on_location_change: boolean;
  days_allowed: string;
  is_active: boolean;
};

type AssignmentRuleWithDetails = TrainingAssignmentRule & {
  module: Pick<TrainingModule, "id" | "title" | "status"> | null;
  position: Pick<Position, "id" | "name"> | null;
  location: Pick<Location, "id" | "name" | "store_number"> | null;
};

type RulesResponse = {
  rules: AssignmentRuleWithDetails[];
  modules: Pick<TrainingModule, "id" | "title" | "status">[];
  positions: Position[];
  locations: Location[];
  canEdit: boolean;
  canApply: boolean;
};

type ApplyResponse = {
  result: {
    employeeCount: number;
    matchedRuleCount: number;
    createdAssignmentCount: number;
    skippedDuplicateCount: number;
  };
};

type FieldErrors = Partial<Record<keyof RuleFormValues, string>>;

const emptyFormValues: RuleFormValues = {
  id: null,
  module_id: "",
  rule_type: "all_employees",
  position_id: "",
  location_id: "",
  assign_on_hire: true,
  assign_on_position_change: true,
  assign_on_location_change: true,
  days_allowed: "",
  is_active: true,
};

const ruleTypeLabels: Record<TrainingAssignmentRuleType, string> = {
  all_employees: "All Employees",
  position: "Position",
  location: "Location",
  position_location: "Position + Location",
};

async function getAuthHeaders() {
  const supabase = createBrowserSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase environment variables are not configured.");
  }

  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session?.access_token) {
    throw new Error(error?.message || "Sign in before managing assignment rules.");
  }

  return {
    Authorization: `Bearer ${data.session.access_token}`,
  };
}

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

  return Object.entries(fieldErrors).reduce<FieldErrors>((errors, [field, value]) => {
    if (typeof value === "string") {
      errors[field as keyof RuleFormValues] = value;
    }

    return errors;
  }, {});
}

function includesPosition(ruleType: TrainingAssignmentRuleType) {
  return ruleType === "position" || ruleType === "position_location";
}

function includesLocation(ruleType: TrainingAssignmentRuleType) {
  return ruleType === "location" || ruleType === "position_location";
}

function validateForm(values: RuleFormValues) {
  const errors: FieldErrors = {};

  if (!values.module_id) errors.module_id = "Choose a training module.";

  if (includesPosition(values.rule_type) && !values.position_id) {
    errors.position_id = "Choose a position.";
  }

  if (includesLocation(values.rule_type) && !values.location_id) {
    errors.location_id = "Choose a location.";
  }

  if (values.days_allowed.trim()) {
    const parsedValue = Number(values.days_allowed);

    if (!Number.isInteger(parsedValue) || parsedValue < 1) {
      errors.days_allowed = "Days allowed must be greater than 0.";
    }
  }

  return errors;
}

function getRuleTriggers(rule: TrainingAssignmentRule) {
  return [
    rule.assign_on_hire ? "Hire" : null,
    rule.assign_on_position_change ? "Position" : null,
    rule.assign_on_location_change ? "Location" : null,
  ]
    .filter(Boolean)
    .join(", ") || "None";
}

function formatLocation(location: Pick<Location, "name" | "store_number"> | null) {
  if (!location) return "Any";

  return `Store ${location.store_number} - ${location.name}`;
}

function buildPayload(values: RuleFormValues) {
  return {
    id: values.id,
    module_id: values.module_id,
    rule_type: values.rule_type,
    position_id: includesPosition(values.rule_type) ? values.position_id : null,
    location_id: includesLocation(values.rule_type) ? values.location_id : null,
    assign_on_hire: values.assign_on_hire,
    assign_on_position_change: values.assign_on_position_change,
    assign_on_location_change: values.assign_on_location_change,
    days_allowed: values.days_allowed.trim() ? Number(values.days_allowed) : null,
    is_active: values.is_active,
  };
}

export default function AssignmentRulesPanel() {
  const [rules, setRules] = useState<AssignmentRuleWithDetails[]>([]);
  const [modules, setModules] = useState<RulesResponse["modules"]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [canApply, setCanApply] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [formValues, setFormValues] = useState<RuleFormValues>(emptyFormValues);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const isEditMode = Boolean(formValues.id);

  const activePositions = useMemo(
    () => positions.filter((position) => position.is_active),
    [positions]
  );
  const activeLocations = useMemo(
    () => locations.filter((location) => location.is_active),
    [locations]
  );

  const fetchRules = useCallback(async (clearMessage = true) => {
    setIsFetching(true);
    if (clearMessage) setMessage(null);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch("/api/training-assignment-rules", { headers });
      const data = (await response.json().catch(() => null)) as
        | RulesResponse
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          getReadableErrorMessage(data, "Unable to load assignment rules.")
        );
      }

      const responseData = data as RulesResponse;
      setRules(responseData.rules ?? []);
      setModules(responseData.modules ?? []);
      setPositions(responseData.positions ?? []);
      setLocations(responseData.locations ?? []);
      setCanEdit(Boolean(responseData.canEdit));
      setCanApply(Boolean(responseData.canApply));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load rules.");
    } finally {
      setIsFetching(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      fetchRules();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [fetchRules]);

  function updateField<Field extends keyof RuleFormValues>(
    field: Field,
    value: RuleFormValues[Field]
  ) {
    setFormValues((currentValues) => ({
      ...currentValues,
      [field]: value,
      ...(field === "rule_type" && !includesPosition(value as TrainingAssignmentRuleType)
        ? { position_id: "" }
        : {}),
      ...(field === "rule_type" && !includesLocation(value as TrainingAssignmentRuleType)
        ? { location_id: "" }
        : {}),
    }));
    setFieldErrors((currentErrors) => ({
      ...currentErrors,
      [field]: undefined,
    }));
  }

  function editRule(rule: AssignmentRuleWithDetails) {
    setFormValues({
      id: rule.id,
      module_id: rule.module_id,
      rule_type: rule.rule_type,
      position_id: rule.position_id ?? "",
      location_id: rule.location_id ?? "",
      assign_on_hire: rule.assign_on_hire,
      assign_on_position_change: rule.assign_on_position_change,
      assign_on_location_change: rule.assign_on_location_change,
      days_allowed: rule.days_allowed === null ? "" : String(rule.days_allowed),
      is_active: rule.is_active,
    });
    setFieldErrors({});
    setMessage(null);
  }

  function resetForm() {
    setFormValues(emptyFormValues);
    setFieldErrors({});
  }

  async function saveRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const errors = validateForm(formValues);
    setFieldErrors(errors);
    setMessage(null);

    if (Object.keys(errors).length > 0) return;

    setIsSaving(true);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch("/api/training-assignment-rules", {
        method: isEditMode ? "PATCH" : "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildPayload(formValues)),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setFieldErrors(getReadableFieldErrors(data));
        throw new Error(
          getReadableErrorMessage(data, "Unable to save assignment rule.")
        );
      }

      setMessage(isEditMode ? "Assignment rule updated." : "Assignment rule added.");
      resetForm();
      await fetchRules(false);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to save assignment rule."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function deactivateRule(rule: AssignmentRuleWithDetails) {
    setIsSaving(true);
    setMessage(null);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch("/api/training-assignment-rules", {
        method: "PATCH",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...buildPayload({
            id: rule.id,
            module_id: rule.module_id,
            rule_type: rule.rule_type,
            position_id: rule.position_id ?? "",
            location_id: rule.location_id ?? "",
            assign_on_hire: rule.assign_on_hire,
            assign_on_position_change: rule.assign_on_position_change,
            assign_on_location_change: rule.assign_on_location_change,
            days_allowed: rule.days_allowed === null ? "" : String(rule.days_allowed),
            is_active: false,
          }),
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          getReadableErrorMessage(data, "Unable to deactivate assignment rule.")
        );
      }

      setMessage("Assignment rule deactivated.");
      await fetchRules(false);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to deactivate assignment rule."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function applyRulesNow() {
    setIsApplying(true);
    setMessage(null);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch("/api/training-assignment-rules/apply", {
        method: "POST",
        headers,
      });
      const data = (await response.json().catch(() => null)) as
        | ApplyResponse
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          getReadableErrorMessage(data, "Unable to apply assignment rules.")
        );
      }

      const result = (data as ApplyResponse).result;
      setMessage(
        `Applied rules to ${result.employeeCount} employees. Created ${result.createdAssignmentCount} assignments and skipped ${result.skippedDuplicateCount} duplicates.`
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to apply assignment rules."
      );
    } finally {
      setIsApplying(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-200 p-5 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Assignment Rules</h2>
          <p className="mt-1 text-sm text-slate-500">
            Assign default trainings from employee position, location, or company-wide rules.
          </p>
        </div>

        {canApply && (
          <button
            type="button"
            disabled={isApplying || isFetching}
            onClick={applyRulesNow}
            className="company-primary-button rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60"
          >
            {isApplying ? "Applying..." : "Apply Rules Now"}
          </button>
        )}
      </div>

      {message && (
        <div className="border-b border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700">
          {message}
        </div>
      )}

      {!canEdit && !isFetching && (
        <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm font-medium text-amber-800">
          Managers can view assignment rules. Only admins can change or apply them.
        </div>
      )}

      {canEdit && (
        <form onSubmit={saveRule} className="border-b border-slate-200 p-5">
          <div className="grid gap-4 lg:grid-cols-4">
            <Field label="Training Module" error={fieldErrors.module_id} required>
              <select
                value={formValues.module_id}
                onChange={(event) => updateField("module_id", event.target.value)}
                className="company-focus w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900"
              >
                <option value="">Choose training</option>
                {modules.map((module) => (
                  <option key={module.id} value={module.id}>
                    {module.title} ({module.status})
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Rule Type" error={fieldErrors.rule_type} required>
              <select
                value={formValues.rule_type}
                onChange={(event) =>
                  updateField(
                    "rule_type",
                    event.target.value as TrainingAssignmentRuleType
                  )
                }
                className="company-focus w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900"
              >
                {Object.entries(ruleTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>

            {includesPosition(formValues.rule_type) && (
              <Field label="Position" error={fieldErrors.position_id} required>
                <select
                  value={formValues.position_id}
                  onChange={(event) => updateField("position_id", event.target.value)}
                  className="company-focus w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900"
                >
                  <option value="">Choose position</option>
                  {activePositions.map((position) => (
                    <option key={position.id} value={position.id}>
                      {position.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            {includesLocation(formValues.rule_type) && (
              <Field label="Location" error={fieldErrors.location_id} required>
                <select
                  value={formValues.location_id}
                  onChange={(event) => updateField("location_id", event.target.value)}
                  className="company-focus w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900"
                >
                  <option value="">Choose location</option>
                  {activeLocations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {formatLocation(location)}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <Field label="Days Allowed" error={fieldErrors.days_allowed}>
              <input
                type="number"
                min="1"
                value={formValues.days_allowed}
                onChange={(event) => updateField("days_allowed", event.target.value)}
                placeholder="Module default"
                className="company-focus w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900"
              />
            </Field>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Checkbox
              label="Assign on hire"
              checked={formValues.assign_on_hire}
              onChange={(checked) => updateField("assign_on_hire", checked)}
            />
            <Checkbox
              label="Assign on position change"
              checked={formValues.assign_on_position_change}
              onChange={(checked) =>
                updateField("assign_on_position_change", checked)
              }
            />
            <Checkbox
              label="Assign on location change"
              checked={formValues.assign_on_location_change}
              onChange={(checked) =>
                updateField("assign_on_location_change", checked)
              }
            />
            <Checkbox
              label="Active"
              checked={formValues.is_active}
              onChange={(checked) => updateField("is_active", checked)}
            />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={isSaving}
              className="company-primary-button rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60"
            >
              {isSaving ? "Saving..." : isEditMode ? "Save Rule" : "Add Rule"}
            </button>
            {isEditMode && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3">Training</th>
              <th className="px-5 py-3">Rule Type</th>
              <th className="px-5 py-3">Position</th>
              <th className="px-5 py-3">Location</th>
              <th className="px-5 py-3">Days</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Triggers</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rules.map((rule) => (
              <tr key={rule.id} className="hover:bg-slate-50">
                <td className="px-5 py-4 font-semibold text-slate-900">
                  {rule.module?.title ?? "Unknown training"}
                </td>
                <td className="px-5 py-4 text-slate-700">
                  {ruleTypeLabels[rule.rule_type]}
                </td>
                <td className="px-5 py-4 text-slate-700">
                  {rule.position?.name ?? "Any"}
                </td>
                <td className="px-5 py-4 text-slate-700">
                  {formatLocation(rule.location)}
                </td>
                <td className="px-5 py-4 text-slate-700">
                  {rule.days_allowed === null ? "Module default" : rule.days_allowed}
                </td>
                <td className="px-5 py-4">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      rule.is_active
                        ? "bg-green-100 text-green-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {rule.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-5 py-4 text-slate-700">
                  {getRuleTriggers(rule)}
                </td>
                <td className="px-5 py-4">
                  <div className="flex justify-end gap-2">
                    {canEdit && (
                      <>
                        <button
                          type="button"
                          onClick={() => editRule(rule)}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Edit
                        </button>
                        {rule.is_active && (
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => deactivateRule(rule)}
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                          >
                            Deactivate
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {rules.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-5 py-10 text-center text-sm font-medium text-slate-500"
                >
                  {isFetching
                    ? "Loading assignment rules."
                    : "No assignment rules have been added yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Field({
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
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">
        {label}
        {required ? " *" : ""}
      </span>
      <span className="mt-2 block">{children}</span>
      {error && <span className="mt-1 block text-xs font-semibold text-red-600">{error}</span>}
    </label>
  );
}

function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex h-11 items-center gap-3 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4"
      />
      {label}
    </label>
  );
}
