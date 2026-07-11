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
  current_match_count: number;
};

type RulesResponse = {
  rules: AssignmentRuleWithDetails[];
  positions: Position[];
  locations: Location[];
  canEdit: boolean;
  canApply: boolean;
};

export type AssignmentRulesSummary = {
  activeRuleCount: number;
  currentMatchCount: number;
  futureAssignmentEnabled: boolean;
  daysAllowedLabels: string[];
};

type FieldErrors = Partial<Record<keyof RuleFormValues, string>>;

const emptyFormValues: RuleFormValues = {
  id: null,
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
  position: "Selected Positions",
  location: "Selected Locations",
  position_location: "Selected Positions at Selected Locations",
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

  const firstFieldError = Object.values(responseData.fieldErrors ?? {}).find(
    (error): error is string => typeof error === "string" && error.trim() !== ""
  );

  return firstFieldError || fallback;
}

function getReadableFieldErrors(data: unknown) {
  if (!data || typeof data !== "object") return {};

  const fieldErrors = (data as { fieldErrors?: unknown }).fieldErrors;

  if (!fieldErrors || typeof fieldErrors !== "object") return {};

  return Object.entries(fieldErrors).reduce<FieldErrors>((errors, [field, value]) => {
    if (typeof value === "string" && field !== "module_id") {
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

function formatLocation(location: Pick<Location, "name" | "store_number"> | null) {
  if (!location) return "Any";

  return `Store ${location.store_number} - ${location.name}`;
}

function getRuleTriggers(rule: TrainingAssignmentRule) {
  return [
    rule.assign_on_hire ? "Hire" : null,
    rule.assign_on_position_change ? "Position change" : null,
    rule.assign_on_location_change ? "Location change" : null,
  ]
    .filter(Boolean)
    .join(", ") || "None";
}

function validateForm(values: RuleFormValues) {
  const errors: FieldErrors = {};

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

function buildPayload(moduleId: string, values: RuleFormValues) {
  return {
    id: values.id,
    module_id: moduleId,
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

export default function TrainingAssignmentRulesPanel({
  moduleId,
  moduleStatus,
  selectedPositionIds,
  onSummaryChange,
  onApplyNow,
}: {
  moduleId: string | null;
  moduleStatus: string | null;
  selectedPositionIds: string[];
  onSummaryChange?: (summary: AssignmentRulesSummary) => void;
  onApplyNow?: () => Promise<void>;
}) {
  const [rules, setRules] = useState<AssignmentRuleWithDetails[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
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
  const summary = useMemo<AssignmentRulesSummary>(() => {
    const activeRules = rules.filter((rule) => rule.is_active);

    return {
      activeRuleCount: activeRules.length,
      currentMatchCount: activeRules.reduce(
        (sum, rule) => sum + rule.current_match_count,
        0
      ),
      futureAssignmentEnabled: activeRules.some(
        (rule) =>
          rule.assign_on_hire ||
          rule.assign_on_position_change ||
          rule.assign_on_location_change
      ),
      daysAllowedLabels: Array.from(
        new Set(
          activeRules.map((rule) =>
            rule.days_allowed === null ? "Module default" : `${rule.days_allowed} days`
          )
        )
      ),
    };
  }, [rules]);

  const fetchRules = useCallback(async () => {
    if (!moduleId) {
      setRules([]);
      setPositions([]);
      setLocations([]);
      setCanEdit(false);
      return;
    }

    setIsFetching(true);
    setMessage(null);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch(
        `/api/training-assignment-rules?module_id=${encodeURIComponent(moduleId)}`,
        { headers }
      );
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
      setPositions(responseData.positions ?? []);
      setLocations(responseData.locations ?? []);
      setCanEdit(Boolean(responseData.canEdit));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load rules.");
    } finally {
      setIsFetching(false);
    }
  }, [moduleId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchRules();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [fetchRules]);

  useEffect(() => {
    onSummaryChange?.(summary);
  }, [onSummaryChange, summary]);

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
    setFieldErrors((currentErrors) => ({ ...currentErrors, [field]: undefined }));
  }

  function editRule(rule: AssignmentRuleWithDetails) {
    setFormValues({
      id: rule.id,
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

  async function applyNow() {
    if (!onApplyNow) return;

    setIsApplying(true);
    setMessage(null);

    try {
      await onApplyNow();
      await fetchRules();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to apply assignment rules."
      );
    } finally {
      setIsApplying(false);
    }
  }

  async function saveRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!moduleId) return;

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
        body: JSON.stringify(buildPayload(moduleId, formValues)),
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
      await fetchRules();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to save assignment rule."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function deactivateRule(rule: AssignmentRuleWithDetails) {
    if (!moduleId) return;

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
        body: JSON.stringify(
          buildPayload(moduleId, {
            id: rule.id,
            rule_type: rule.rule_type,
            position_id: rule.position_id ?? "",
            location_id: rule.location_id ?? "",
            assign_on_hire: rule.assign_on_hire,
            assign_on_position_change: rule.assign_on_position_change,
            assign_on_location_change: rule.assign_on_location_change,
            days_allowed: rule.days_allowed === null ? "" : String(rule.days_allowed),
            is_active: false,
          })
        ),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          getReadableErrorMessage(data, "Unable to deactivate assignment rule.")
        );
      }

      setMessage("Assignment rule deactivated.");
      await fetchRules();
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

  async function createRulesFromSelectedPositions() {
    if (!moduleId || selectedPositionIds.length === 0) return;

    setIsSaving(true);
    setMessage(null);

    try {
      const headers = await getAuthHeaders();

      for (const positionId of selectedPositionIds) {
        const response = await fetch("/api/training-assignment-rules", {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            module_id: moduleId,
            rule_type: "position",
            position_id: positionId,
            location_id: null,
            assign_on_hire: true,
            assign_on_position_change: true,
            assign_on_location_change: false,
            days_allowed: null,
            is_active: true,
          }),
        });
        const data = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(
            getReadableErrorMessage(data, "Unable to create assignment rules.")
          );
        }
      }

      setMessage("Assignment rules created from selected positions.");
      await fetchRules();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to create assignment rules from selected positions."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section id="assignments" className="rounded-xl bg-white p-6 shadow-sm">
      <div className="border-b border-slate-200 pb-5">
        <h2 className="text-lg font-bold text-slate-900">
          Audience & Assignments
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Who should automatically receive this training?
        </p>
      </div>

      {!moduleId ? (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          Save the training draft before adding automatic assignment rules.
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          {moduleStatus !== "published" && summary.activeRuleCount > 0 && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800">
              This training is still a draft, so no assignments will be created yet.
              Active rules will apply when the training is published.
            </div>
          )}

          {message && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
              {message}
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-3">
            <SummaryCard label="Active rules" value={summary.activeRuleCount} />
            <SummaryCard label="Current matches" value={summary.currentMatchCount} />
            <SummaryCard
              label="Future employees"
              value={summary.futureAssignmentEnabled ? "Enabled" : "Off"}
            />
          </div>

          {moduleStatus === "published" && summary.activeRuleCount > 0 && canEdit && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <p className="text-sm font-semibold text-blue-900">
                This rule applies to current and future employees who match these
                conditions.
              </p>
              <p className="mt-1 text-sm text-blue-800">
                Applying now will create assignments for up to{" "}
                {summary.currentMatchCount} employees. Existing assignments are
                skipped.
              </p>
              <button
                type="button"
                disabled={isApplying || isSaving}
                onClick={applyNow}
                className="mt-3 rounded-lg border border-blue-300 bg-white px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-60"
              >
                {isApplying ? "Applying..." : "Apply active rules now"}
              </button>
            </div>
          )}

          {selectedPositionIds.length > 0 && canEdit && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">
                training_audience describes who the content is relevant to.
                Assignment rules control automatic assignment.
              </p>
              {/* Audience selections are descriptive/relevance metadata; training_assignment_rules are the only automatic assignment source of truth. */}
              {/* TODO: AI-generated audience recommendations can appear here later as suggestions only, never as active rules without admin confirmation. */}
              <button
                type="button"
                disabled={isSaving}
                onClick={createRulesFromSelectedPositions}
                className="mt-3 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Create assignment rules from selected positions
              </button>
            </div>
          )}

          {canEdit && (
            <form onSubmit={saveRule} className="rounded-lg border border-slate-200 p-4">
              <div className="grid gap-4 lg:grid-cols-4">
                <Field label="Automatic Assignment">
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
                    <option value="all_employees">All employees</option>
                    <option value="position">Selected positions</option>
                    <option value="location">Selected locations</option>
                    <option value="position_location">
                      Selected positions at selected locations
                    </option>
                  </select>
                </Field>

                {includesPosition(formValues.rule_type) && (
                  <Field label="Position" error={fieldErrors.position_id}>
                    <select
                      value={formValues.position_id}
                      onChange={(event) =>
                        updateField("position_id", event.target.value)
                      }
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
                  <Field label="Location" error={fieldErrors.location_id}>
                    <select
                      value={formValues.location_id}
                      onChange={(event) =>
                        updateField("location_id", event.target.value)
                      }
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
                    onChange={(event) =>
                      updateField("days_allowed", event.target.value)
                    }
                    placeholder="Module default"
                    className="company-focus w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900"
                  />
                </Field>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
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

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={isSaving || isFetching}
                  className="company-primary-button rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60"
                >
                  {isSaving ? "Saving..." : isEditMode ? "Save Rule" : "Add Assignment Rule"}
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

          <div className="space-y-3">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="rounded-lg border border-slate-200 bg-slate-50 p-4"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-900">
                        {ruleTypeLabels[rule.rule_type]}
                      </p>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          rule.is_active
                            ? "bg-green-100 text-green-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {rule.is_active ? "Active" : "Inactive"}
                      </span>
                      {moduleStatus !== "published" && rule.is_active && (
                        <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">
                          Active when published
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                      Position: {rule.position?.name ?? "Any"} · Location:{" "}
                      {formatLocation(rule.location)}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Days allowed:{" "}
                      {rule.days_allowed === null ? "Module default" : rule.days_allowed} ·
                      Triggers: {getRuleTriggers(rule)}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-700">
                      Current matches: {rule.current_match_count} employees
                    </p>
                  </div>

                  {canEdit && (
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => editRule(rule)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Edit
                      </button>
                      {rule.is_active && (
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => deactivateRule(rule)}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                        >
                          Deactivate
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {rules.length === 0 && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                {isFetching
                  ? "Loading assignment rules."
                  : "No automatic assignment rules for this training."}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold text-slate-900">{value}</p>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
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
