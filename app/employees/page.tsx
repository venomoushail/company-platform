"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type {
  Company,
  Location,
  Position,
  Profile,
  ProfileRole,
} from "@/types/supabase";

type EmployeeWithPositions = Profile & {
  positions: Position[];
};

type EmployeeFormValues = {
  first_name: string;
  last_name: string;
  preferred_name: string;
  email: string;
  employee_number: string;
  role: ProfileRole;
  location_id: string;
  position_ids: string[];
  hire_date: string;
  is_active: boolean;
};

type EmployeeFormErrors = Partial<Record<keyof EmployeeFormValues, string>>;

type TestPasswordFormValues = {
  password: string;
  confirmPassword: string;
};

type TestPasswordFormErrors = Partial<
  Record<keyof TestPasswordFormValues, string>
>;

type SortKey =
  | "name"
  | "email"
  | "employee_number"
  | "role"
  | "positions"
  | "location"
  | "status"
  | "hire_date";

type SortDirection = "asc" | "desc";

type SortState = {
  key: SortKey;
  direction: SortDirection;
};

type EmployeesApiResponse = {
  employees: EmployeeWithPositions[];
  locations: Location[];
  positions: Position[];
  company: Pick<Company, "id" | "name">;
  adminProfile: Profile;
};

const roles: ProfileRole[] = ["employee", "manager", "admin"];
const unassignedLocationFilterId = "__unassigned__";
const filterControlClass =
  "mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-blue-600";
const positionDisplayOrder = [
  "Host",
  "Production",
  "Server",
  "Shift Leader",
  "Team Leader",
  "Manager",
  "General Manager",
];

const emptyFormValues: EmployeeFormValues = {
  first_name: "",
  last_name: "",
  preferred_name: "",
  email: "",
  employee_number: "",
  role: "employee",
  location_id: "",
  position_ids: [],
  hire_date: "",
  is_active: true,
};

const emptyTestPasswordValues: TestPasswordFormValues = {
  password: "",
  confirmPassword: "",
};

function formatDate(date: string | null) {
  if (!date) return "Not set";

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00`));
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function formatLocationLabel(location: Location) {
  return `Store ${location.store_number} - ${location.name}`;
}

function getLocationLabel(locationId: string | null, locations: Location[]) {
  if (!locationId) return "Not assigned";

  const location = locations.find(({ id }) => id === locationId);

  return location ? formatLocationLabel(location) : "Unknown location";
}

function getLocationFilterLabel(locationId: string, locations: Location[]) {
  if (locationId === unassignedLocationFilterId) return "Unassigned";

  const location = locations.find(({ id }) => id === locationId);

  return location ? formatLocationLabel(location) : "Unknown location";
}

function getLocationFilterOptions(locations: Location[]) {
  return [
    ...locations.map((location) => ({
      id: location.id,
      label: formatLocationLabel(location),
    })),
    {
      id: unassignedLocationFilterId,
      label: "Unassigned",
    },
  ];
}

function getLocationFilterButtonLabel(
  selectedLocationIds: string[],
  locations: Location[]
) {
  const options = getLocationFilterOptions(locations);

  if (selectedLocationIds.length === 0) return "No locations";
  if (selectedLocationIds.length === options.length) return "All locations";

  if (selectedLocationIds.length === 1) {
    return getLocationFilterLabel(selectedLocationIds[0], locations);
  }

  return `${selectedLocationIds.length} locations`;
}

function getPositionLabels(employee: EmployeeWithPositions) {
  return employee.positions.length > 0 ? employee.positions : [];
}

function sortPositions(positions: Position[]) {
  return [...positions].sort((firstPosition, secondPosition) => {
    const firstIndex = positionDisplayOrder.indexOf(firstPosition.name);
    const secondIndex = positionDisplayOrder.indexOf(secondPosition.name);

    if (firstIndex !== -1 && secondIndex !== -1) {
      return firstIndex - secondIndex;
    }

    if (firstIndex !== -1) return -1;
    if (secondIndex !== -1) return 1;

    return firstPosition.name.localeCompare(secondPosition.name);
  });
}

function compareStrings(firstValue: string, secondValue: string) {
  return firstValue.localeCompare(secondValue, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function getEmployeeSortValue(
  employee: EmployeeWithPositions,
  sortKey: SortKey,
  locations: Location[]
) {
  if (sortKey === "name") {
    return `${employee.last_name} ${employee.first_name} ${employee.full_name}`;
  }

  if (sortKey === "location") {
    return getLocationLabel(employee.location_id, locations);
  }

  if (sortKey === "positions") {
    return getPositionLabels(employee)
      .map((position) => position.name)
      .join(", ");
  }

  if (sortKey === "status") {
    return employee.is_active ? "active" : "inactive";
  }

  return employee[sortKey] ?? "";
}

function sortEmployees(
  employees: EmployeeWithPositions[],
  sortState: SortState,
  locations: Location[]
) {
  return [...employees].sort((firstEmployee, secondEmployee) => {
    const firstValue = getEmployeeSortValue(
      firstEmployee,
      sortState.key,
      locations
    );
    const secondValue = getEmployeeSortValue(
      secondEmployee,
      sortState.key,
      locations
    );
    const result = compareStrings(String(firstValue), String(secondValue));

    return sortState.direction === "asc" ? result : -result;
  });
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

  return Object.entries(fieldErrors).reduce<EmployeeFormErrors>(
    (errors, [field, value]) => {
      if (typeof value === "string") {
        errors[field as keyof EmployeeFormErrors] = value;
      }

      return errors;
    },
    {}
  );
}

function roleBadgeClass(role: ProfileRole) {
  if (role === "admin") return "bg-purple-100 text-purple-700";
  if (role === "manager") return "bg-blue-100 text-blue-700";

  return "bg-slate-100 text-slate-700";
}

function validateEmployeeForm(
  values: EmployeeFormValues,
  employees: EmployeeWithPositions[],
  locations: Location[],
  positions: Position[],
  currentEmployeeId?: string
) {
  const errors: EmployeeFormErrors = {};
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!values.first_name.trim()) {
    errors.first_name = "First name is required.";
  }

  if (!values.last_name.trim()) {
    errors.last_name = "Last name is required.";
  }

  if (!values.email.trim()) {
    errors.email = "Email is required.";
  } else if (!emailPattern.test(values.email.trim())) {
    errors.email = "Enter a valid email address.";
  } else if (
    employees.some(
      (employee) =>
        employee.id !== currentEmployeeId &&
        normalize(employee.email) === normalize(values.email)
    )
  ) {
    errors.email = "Email already exists.";
  }

  if (!values.employee_number.trim()) {
    errors.employee_number = "Employee number is required.";
  } else if (
    employees.some(
      (employee) =>
        employee.id !== currentEmployeeId &&
        normalize(employee.employee_number) === normalize(values.employee_number)
    )
  ) {
    errors.employee_number = "An employee with this employee number already exists.";
  }

  if (!roles.includes(values.role)) {
    errors.role = "Choose a valid role.";
  }

  if (
    values.location_id &&
    !locations.some((location) => location.id === values.location_id)
  ) {
    errors.location_id = "Choose a valid location.";
  }

  if (
    values.position_ids.some(
      (positionId) => !positions.some((position) => position.id === positionId)
    )
  ) {
    errors.position_ids = "Choose valid positions.";
  }

  return errors;
}

function validateTestPasswordForm(values: TestPasswordFormValues) {
  const errors: TestPasswordFormErrors = {};
  const password = values.password.trim();

  if (!password) {
    errors.password = "Password is required.";
  } else if (password.length < 8) {
    errors.password = "Enter a password with at least 8 characters.";
  }

  if (values.confirmPassword.trim() !== password) {
    errors.confirmPassword = "Passwords must match.";
  }

  return errors;
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<EmployeeWithPositions[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [adminProfile, setAdminProfile] = useState<Profile | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [formValues, setFormValues] =
    useState<EmployeeFormValues>(emptyFormValues);
  const [formErrors, setFormErrors] = useState<EmployeeFormErrors>({});
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionEmployeeId, setActionEmployeeId] = useState<string | null>(null);
  const [passwordSetupEmployeeId, setPasswordSetupEmployeeId] = useState<
    string | null
  >(null);
  const [testPasswordEmployeeId, setTestPasswordEmployeeId] = useState<
    string | null
  >(null);
  const [testPasswordEmployee, setTestPasswordEmployee] =
    useState<EmployeeWithPositions | null>(null);
  const [testPasswordValues, setTestPasswordValues] =
    useState<TestPasswordFormValues>(emptyTestPasswordValues);
  const [testPasswordErrors, setTestPasswordErrors] =
    useState<TestPasswordFormErrors>({});
  const [testPasswordMessage, setTestPasswordMessage] = useState<string | null>(
    null
  );
  const [actionMenuEmployeeId, setActionMenuEmployeeId] = useState<
    string | null
  >(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<ProfileRole | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">(
    "all"
  );
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[] | null>(
    null
  );
  const [isLocationFilterOpen, setIsLocationFilterOpen] = useState(false);
  const [sortState, setSortState] = useState<SortState>({
    key: "name",
    direction: "asc",
  });

  const locationFilterOptions = useMemo(
    () => getLocationFilterOptions(locations),
    [locations]
  );
  const effectiveSelectedLocationIds = useMemo(
    () => selectedLocationIds ?? locationFilterOptions.map((option) => option.id),
    [locationFilterOptions, selectedLocationIds]
  );

  const filteredEmployees = useMemo(() => {
    const query = normalize(searchQuery);
    const selectedLocations = new Set(effectiveSelectedLocationIds);

    return employees.filter((employee) => {
      const matchesSearch =
        !query ||
        normalize(employee.full_name).includes(query) ||
        normalize(employee.preferred_name ?? "").includes(query) ||
        normalize(employee.email).includes(query) ||
        normalize(employee.employee_number).includes(query) ||
        normalize(getLocationLabel(employee.location_id, locations)).includes(query) ||
        employee.positions.some((position) =>
          normalize(position.name).includes(query)
        );

      const matchesRole = roleFilter === "all" || employee.role === roleFilter;
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && employee.is_active) ||
        (statusFilter === "inactive" && !employee.is_active);
      const employeeLocationId =
        employee.location_id ?? unassignedLocationFilterId;
      const matchesLocation =
        selectedLocations.size > 0 && selectedLocations.has(employeeLocationId);

      return matchesSearch && matchesRole && matchesStatus && matchesLocation;
    });
  }, [
    employees,
    locations,
    roleFilter,
    searchQuery,
    effectiveSelectedLocationIds,
    statusFilter,
  ]);

  const sortedEmployees = useMemo(
    () => sortEmployees(filteredEmployees, sortState, locations),
    [filteredEmployees, locations, sortState]
  );

  const isEditMode = editingEmployeeId !== null;
  const canSetTestPassword = adminProfile?.role === "admin";

  const fetchEmployees = useCallback(async (showLoading = true) => {
    await Promise.resolve();

    const supabase = createBrowserSupabaseClient();

    if (!supabase) {
      setPageError("Supabase environment variables are not configured.");
      setIsFetching(false);
      return;
    }

    if (showLoading) setIsFetching(true);
    setPageError(null);

    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();

    if (sessionError || !sessionData.session) {
      setPageError(sessionError?.message || "Sign in to view employees.");
      setIsFetching(false);
      return;
    }

    const response = await fetch("/api/employees", {
      headers: {
        Authorization: `Bearer ${sessionData.session.access_token}`,
      },
    });
    const data = await response.json();

    if (!response.ok) {
      console.error("Unable to load employees", data);
      setPageError(
        getReadableErrorMessage(data, "Unable to load employees.")
      );
      setIsFetching(false);
      return;
    }

    const employeesData = data as EmployeesApiResponse;

    setEmployees(
      employeesData.employees.map((employee) => ({
        ...employee,
        positions: sortPositions(employee.positions),
      }))
    );
    setLocations(employeesData.locations);
    setPositions(sortPositions(employeesData.positions));
    setAdminProfile(employeesData.adminProfile);
    setCompanyName(employeesData.company.name);
    setIsFetching(false);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      fetchEmployees();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [fetchEmployees]);

  function updateFormValue<Field extends keyof EmployeeFormValues>(
    field: Field,
    value: EmployeeFormValues[Field]
  ) {
    setFormValues((currentValues) => ({
      ...currentValues,
      [field]: value,
    }));

    setFormErrors((currentErrors) => ({
      ...currentErrors,
      [field]: undefined,
    }));
  }

  function updateSelectedPosition(positionId: string, isSelected: boolean) {
    setFormValues((currentValues) => ({
      ...currentValues,
      position_ids: isSelected
        ? [...currentValues.position_ids, positionId]
        : currentValues.position_ids.filter(
            (currentPositionId) => currentPositionId !== positionId
          ),
    }));

    setFormErrors((currentErrors) => ({
      ...currentErrors,
      position_ids: undefined,
    }));
  }

  function updateSort(nextSortKey: SortKey) {
    setSortState((currentSortState) => ({
      key: nextSortKey,
      direction:
        currentSortState.key === nextSortKey &&
        currentSortState.direction === "asc"
          ? "desc"
          : "asc",
    }));
  }

  function selectAllLocations() {
    setSelectedLocationIds(locationFilterOptions.map((option) => option.id));
  }

  function deselectAllLocations() {
    setSelectedLocationIds([]);
  }

  function updateSelectedLocation(locationId: string, isSelected: boolean) {
    setSelectedLocationIds((currentLocationIds) => {
      const currentSelection =
        currentLocationIds ?? locationFilterOptions.map((option) => option.id);

      if (isSelected) {
        return Array.from(new Set([...currentSelection, locationId]));
      }

      return currentSelection.filter(
        (currentLocationId) => currentLocationId !== locationId
      );
    });
  }

  function openForm() {
    setEditingEmployeeId(null);
    setFormValues(emptyFormValues);
    setFormErrors({});
    setFormMessage(null);
    setSuccessMessage(null);
    setIsFormOpen(true);
  }

  function openEditForm(employee: EmployeeWithPositions) {
    setActionMenuEmployeeId(null);
    setEditingEmployeeId(employee.id);
    setFormValues({
      first_name: employee.first_name,
      last_name: employee.last_name,
      preferred_name: employee.preferred_name ?? "",
      email: employee.email,
      employee_number: employee.employee_number,
      role: employee.role,
      location_id: employee.location_id ?? "",
      position_ids: employee.positions.map((position) => position.id),
      hire_date: employee.hire_date ?? "",
      is_active: employee.is_active,
    });
    setFormErrors({});
    setFormMessage(null);
    setSuccessMessage(null);
    setIsFormOpen(true);
  }

  function closeForm() {
    setIsFormOpen(false);
    setEditingEmployeeId(null);
    setFormErrors({});
    setFormMessage(null);
  }

  function openTestPasswordModal(employee: EmployeeWithPositions) {
    setActionMenuEmployeeId(null);
    setTestPasswordEmployee(employee);
    setTestPasswordValues(emptyTestPasswordValues);
    setTestPasswordErrors({});
    setTestPasswordMessage(null);
    setPageError(null);
    setSuccessMessage(null);
  }

  function closeTestPasswordModal() {
    if (testPasswordEmployeeId) return;

    setTestPasswordEmployee(null);
    setTestPasswordValues(emptyTestPasswordValues);
    setTestPasswordErrors({});
    setTestPasswordMessage(null);
  }

  function updateTestPasswordValue(
    field: keyof TestPasswordFormValues,
    value: string
  ) {
    setTestPasswordValues((currentValues) => ({
      ...currentValues,
      [field]: value,
    }));
    setTestPasswordErrors((currentErrors) => ({
      ...currentErrors,
      [field]: undefined,
    }));
    setTestPasswordMessage(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const errors = validateEmployeeForm(
      formValues,
      employees,
      locations,
      positions,
      editingEmployeeId ?? undefined
    );
    setFormErrors(errors);
    setFormMessage(null);
    setSuccessMessage(null);

    if (Object.keys(errors).length > 0) return;

    const supabase = createBrowserSupabaseClient();

    if (!supabase) {
      setFormMessage("Supabase environment variables are not configured.");
      return;
    }

    setIsSubmitting(true);

    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();

    if (sessionError || !sessionData.session) {
      setFormMessage(sessionError?.message || "Sign in before saving employees.");
      setIsSubmitting(false);
      return;
    }

    const response = await fetch("/api/employees", {
      method: isEditMode ? "PATCH" : "POST",
      headers: {
        Authorization: `Bearer ${sessionData.session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: editingEmployeeId,
        first_name: formValues.first_name,
        last_name: formValues.last_name,
        preferred_name: formValues.preferred_name,
        email: formValues.email,
        employee_number: formValues.employee_number,
        role: formValues.role,
        location_id: formValues.location_id || null,
        position_ids: formValues.position_ids,
        hire_date: formValues.hire_date || null,
        is_active: formValues.is_active,
      }),
    });
    const data = await response.json();

    setIsSubmitting(false);

    if (!response.ok) {
      console.error("Unable to save employee", data);
      setFormErrors(getReadableFieldErrors(data));
      setFormMessage(
        getReadableErrorMessage(
          data,
          isEditMode
            ? "Unable to save changes. Please try again."
            : "Unable to create employee. Please try again."
        )
      );
      return;
    }

    setFormValues(emptyFormValues);
    setFormErrors({});
    setIsFormOpen(false);
    setEditingEmployeeId(null);
    setSuccessMessage(
      isEditMode
        ? "Employee changes saved successfully."
        : "Employee created successfully."
    );
    await fetchEmployees(false);
  }

  async function handleToggleActive(employee: EmployeeWithPositions) {
    setActionMenuEmployeeId(null);

    if (
      employee.is_active &&
      !window.confirm(`Deactivate ${employee.full_name}?`)
    ) {
      return;
    }

    const supabase = createBrowserSupabaseClient();

    if (!supabase) {
      setPageError("Supabase environment variables are not configured.");
      return;
    }

    setActionEmployeeId(employee.id);
    setPageError(null);
    setSuccessMessage(null);

    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();

    if (sessionError || !sessionData.session) {
      setPageError(sessionError?.message || "Sign in before updating employees.");
      setActionEmployeeId(null);
      return;
    }

    const nextIsActive = !employee.is_active;
    const response = await fetch("/api/employees", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${sessionData.session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: employee.id,
        first_name: employee.first_name,
        last_name: employee.last_name,
        preferred_name: employee.preferred_name,
        email: employee.email,
        employee_number: employee.employee_number,
        role: employee.role,
        location_id: employee.location_id,
        hire_date: employee.hire_date,
        is_active: nextIsActive,
        position_ids: employee.positions.map((position) => position.id),
      }),
    });
    const data = await response.json();

    setActionEmployeeId(null);

    if (!response.ok) {
      console.error("Unable to update employee status", data);
      setPageError(
        getReadableErrorMessage(
          data,
          "Unable to update employee status. Please try again."
        )
      );
      return;
    }

    setEmployees((currentEmployees) =>
      currentEmployees.map((currentEmployee) =>
        currentEmployee.id === employee.id
          ? { ...currentEmployee, is_active: nextIsActive }
          : currentEmployee
      )
    );
    setSuccessMessage(
      nextIsActive
        ? "Employee reactivated successfully."
        : "Employee deactivated successfully."
    );
    await fetchEmployees(false);
  }

  async function handleSendPasswordSetup(employee: EmployeeWithPositions) {
    setActionMenuEmployeeId(null);

    const supabase = createBrowserSupabaseClient();

    if (!supabase) {
      setPageError("Supabase environment variables are not configured.");
      return;
    }

    setPasswordSetupEmployeeId(employee.id);
    setPageError(null);
    setSuccessMessage(null);

    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();

    if (sessionError || !sessionData.session) {
      setPageError(sessionError?.message || "Sign in before updating employees.");
      setPasswordSetupEmployeeId(null);
      return;
    }

    const response = await fetch("/api/employees/password-setup", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionData.session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        employee_id: employee.id,
      }),
    });
    const data = await response.json();

    setPasswordSetupEmployeeId(null);

    if (!response.ok) {
      console.error("Unable to send password setup email", data);
      setPageError(
        getReadableErrorMessage(
          data,
          "Unable to send password setup email."
        )
      );
      return;
    }

    setSuccessMessage("Password setup email sent.");
  }

  async function handleSetTestPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!testPasswordEmployee) return;

    const validationErrors = validateTestPasswordForm(testPasswordValues);

    if (Object.keys(validationErrors).length > 0) {
      setTestPasswordErrors(validationErrors);
      return;
    }

    const newPassword = testPasswordValues.password.trim();

    const supabase = createBrowserSupabaseClient();

    if (!supabase) {
      setTestPasswordMessage("Supabase environment variables are not configured.");
      return;
    }

    setTestPasswordEmployeeId(testPasswordEmployee.id);
    setTestPasswordMessage(null);
    setSuccessMessage(null);

    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();

    if (sessionError || !sessionData.session) {
      setTestPasswordMessage(
        sessionError?.message || "Sign in before updating employees."
      );
      setTestPasswordEmployeeId(null);
      return;
    }

    const response = await fetch("/api/employees/test-password", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionData.session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        employee_id: testPasswordEmployee.id,
        password: newPassword,
      }),
    });
    const data = await response.json();

    setTestPasswordEmployeeId(null);

    if (!response.ok) {
      console.error("Unable to set test password", data);
      setTestPasswordMessage(
        getReadableErrorMessage(data, "Unable to set test password.")
      );
      return;
    }

    setSuccessMessage(`Test password set for ${testPasswordEmployee.full_name}.`);
    closeTestPasswordModal();
  }

  return (
    <AdminLayout
      title="Employees"
      description="Manage employee profiles, roles, locations, and account status."
    >
      <div className="space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_180px_240px_180px_auto] xl:items-end">
            <div>
              <label className="block text-sm font-semibold text-slate-700">
                Search
              </label>
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search name, email, or employee #"
                className={filterControlClass}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700">
                Role
              </label>
              <select
                value={roleFilter}
                onChange={(event) =>
                  setRoleFilter(event.target.value as ProfileRole | "all")
                }
                className={filterControlClass}
              >
                <option value="all">All roles</option>
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative">
              <label className="block text-sm font-semibold text-slate-700">
                Location
              </label>
              <button
                type="button"
                onClick={() =>
                  setIsLocationFilterOpen((isOpen) => !isOpen)
                }
                aria-expanded={isLocationFilterOpen}
                className={`${filterControlClass} flex items-center justify-between gap-2 text-left hover:bg-slate-50`}
              >
                <span className="truncate">
                  {getLocationFilterButtonLabel(
                    effectiveSelectedLocationIds,
                    locations
                  )}
                </span>
                <span className="text-xs text-slate-500">
                  {isLocationFilterOpen ? "▲" : "▼"}
                </span>
              </button>

              {isLocationFilterOpen && (
                <div className="absolute z-20 mt-2 w-full min-w-[260px] rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
                  <div className="mb-3 flex gap-2 border-b border-slate-100 pb-3">
                    <button
                      type="button"
                      onClick={selectAllLocations}
                      className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={deselectAllLocations}
                      className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Deselect All
                    </button>
                  </div>

                  <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                    {locationFilterOptions.map((option) => (
                      <label
                        key={option.id}
                        className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={effectiveSelectedLocationIds.includes(
                            option.id
                          )}
                          onChange={(event) =>
                            updateSelectedLocation(
                              option.id,
                              event.target.checked
                            )
                          }
                          className="h-4 w-4"
                        />
                        <span className="truncate">{option.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(
                    event.target.value as "all" | "active" | "inactive"
                  )
                }
                className={filterControlClass}
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <button
              type="button"
              onClick={openForm}
              disabled={isFetching}
              className="company-primary-button h-11 rounded-lg px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
            >
              + Add Employee
            </button>
          </div>
        </div>

        {pageError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {pageError}
          </div>
        )}

        {successMessage && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
            {successMessage}
          </div>
        )}

        {isFormOpen && (
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-start justify-between gap-4 border-b border-slate-200 pb-5">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {isEditMode ? "Edit Employee" : "Add Employee"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {isEditMode
                    ? "Update the profile row and assigned positions."
                    : "Create an auth user and matching public.profiles row."}
                </p>
                {companyName && (
                  <p className="mt-2 text-xs font-medium text-slate-500">
                    Company: {companyName}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={closeForm}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {formMessage && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {formMessage}
                </div>
              )}

              <div className="grid gap-5 md:grid-cols-2">
                <FormField
                  label="First Name"
                  error={formErrors.first_name}
                  required
                >
                  <input
                    type="text"
                    value={formValues.first_name}
                    onChange={(event) =>
                      updateFormValue("first_name", event.target.value)
                    }
                    className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-600"
                  />
                </FormField>

                <FormField
                  label="Last Name"
                  error={formErrors.last_name}
                  required
                >
                  <input
                    type="text"
                    value={formValues.last_name}
                    onChange={(event) =>
                      updateFormValue("last_name", event.target.value)
                    }
                    className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-600"
                  />
                </FormField>

                <FormField label="Preferred Name" error={formErrors.preferred_name}>
                  <input
                    type="text"
                    value={formValues.preferred_name}
                    onChange={(event) =>
                      updateFormValue("preferred_name", event.target.value)
                    }
                    className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-600"
                  />
                </FormField>

                <FormField label="Email" error={formErrors.email} required>
                  <input
                    type="email"
                    value={formValues.email}
                    onChange={(event) =>
                      updateFormValue("email", event.target.value)
                    }
                    className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-600"
                  />
                </FormField>

                <FormField
                  label="Employee Number"
                  error={formErrors.employee_number}
                  required
                >
                  <input
                    type="text"
                    value={formValues.employee_number}
                    onChange={(event) =>
                      updateFormValue("employee_number", event.target.value)
                    }
                    className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-600"
                  />
                </FormField>

                <FormField label="Role" error={formErrors.role} required>
                  <select
                    value={formValues.role}
                    onChange={(event) =>
                      updateFormValue("role", event.target.value as ProfileRole)
                    }
                    className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-600"
                  >
                    {roles.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField label="Location" error={formErrors.location_id}>
                  <select
                    value={formValues.location_id}
                    onChange={(event) =>
                      updateFormValue("location_id", event.target.value)
                    }
                    className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-600"
                  >
                    <option value="">No location assigned</option>
                    {locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {formatLocationLabel(location)}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField label="Hire Date" error={formErrors.hire_date}>
                  <input
                    type="date"
                    value={formValues.hire_date}
                    onChange={(event) =>
                      updateFormValue("hire_date", event.target.value)
                    }
                    className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-600"
                  />
                </FormField>

                <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={formValues.is_active}
                      onChange={(event) =>
                        updateFormValue("is_active", event.target.checked)
                      }
                      className="h-4 w-4"
                    />
                    Active employee
                  </label>
                </div>
              </div>

              <FormField label="Positions" error={formErrors.position_ids}>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  {isFetching ? (
                    <p className="text-sm font-medium text-slate-500">
                      Loading positions...
                    </p>
                  ) : positions.length === 0 ? (
                    <p className="text-sm font-medium text-slate-500">
                      No active positions exist for this company.
                    </p>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {positions.map((position) => (
                        <label
                          key={position.id}
                          className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                        >
                          <input
                            type="checkbox"
                            checked={formValues.position_ids.includes(
                              position.id
                            )}
                            onChange={(event) =>
                              updateSelectedPosition(
                                position.id,
                                event.target.checked
                              )
                            }
                            className="h-4 w-4"
                          />
                          {position.name}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </FormField>

              <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 pt-5">
                <button
                  type="button"
                  onClick={closeForm}
                  disabled={isSubmitting}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="company-primary-button rounded-lg px-4 py-2 text-sm font-semibold"
                >
                  {isSubmitting
                    ? isEditMode
                      ? "Saving..."
                      : "Adding..."
                    : isEditMode
                      ? "Save Changes"
                      : "Add Employee"}
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="rounded-xl bg-white shadow-sm">
          {isFetching ? (
            <div className="px-6 py-12 text-center">
              <p className="font-semibold text-slate-900">Loading employees</p>
              <p className="mt-2 text-sm text-slate-500">
                Fetching profiles and locations from Supabase.
              </p>
            </div>
          ) : sortedEmployees.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="font-semibold text-slate-900">No employees found</p>
              <p className="mt-2 text-sm text-slate-500">
                Adjust your filters or add a new employee profile.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1280px] border-collapse text-left">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <SortableTableHeader
                      sortKey="name"
                      sortState={sortState}
                      onSort={updateSort}
                    >
                      Name
                    </SortableTableHeader>
                    <TableHeader>Preferred Name</TableHeader>
                    <SortableTableHeader
                      sortKey="email"
                      sortState={sortState}
                      onSort={updateSort}
                    >
                      Email
                    </SortableTableHeader>
                    <SortableTableHeader
                      sortKey="employee_number"
                      sortState={sortState}
                      onSort={updateSort}
                    >
                      Employee #
                    </SortableTableHeader>
                    <SortableTableHeader
                      sortKey="role"
                      sortState={sortState}
                      onSort={updateSort}
                    >
                      Role
                    </SortableTableHeader>
                    <SortableTableHeader
                      sortKey="positions"
                      sortState={sortState}
                      onSort={updateSort}
                    >
                      Positions
                    </SortableTableHeader>
                    <SortableTableHeader
                      sortKey="location"
                      sortState={sortState}
                      onSort={updateSort}
                    >
                      Location
                    </SortableTableHeader>
                    <SortableTableHeader
                      sortKey="status"
                      sortState={sortState}
                      onSort={updateSort}
                    >
                      Status
                    </SortableTableHeader>
                    <SortableTableHeader
                      sortKey="hire_date"
                      sortState={sortState}
                      onSort={updateSort}
                    >
                      Hire Date
                    </SortableTableHeader>
                    <TableHeader className="w-28 text-right">Actions</TableHeader>
                  </tr>
                </thead>

                <tbody>
                  {sortedEmployees.map((employee) => (
                    <tr
                      key={employee.id}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                    >
                      <TableCell>
                        <p className="font-medium text-slate-900">
                          {employee.full_name}
                        </p>
                      </TableCell>
                      <TableCell>{employee.preferred_name || "Not set"}</TableCell>
                      <TableCell>{employee.email}</TableCell>
                      <TableCell>{employee.employee_number}</TableCell>
                      <TableCell>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${roleBadgeClass(
                            employee.role
                          )}`}
                        >
                          {employee.role}
                        </span>
                      </TableCell>
                      <TableCell>
                        {getPositionLabels(employee).length === 0 ? (
                          "None"
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {getPositionLabels(employee).map((position) => (
                              <span
                                key={position.id}
                                className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700"
                              >
                                {position.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {getLocationLabel(employee.location_id, locations)}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            employee.is_active
                              ? "bg-green-100 text-green-700"
                              : "border border-slate-300 bg-slate-100 text-slate-600"
                          }`}
                        >
                          {employee.is_active ? "Active" : "Inactive"}
                        </span>
                      </TableCell>
                      <TableCell>{formatDate(employee.hire_date)}</TableCell>
                      <td className="relative px-6 py-4 text-right text-sm text-slate-600">
                        <div className="inline-block text-left">
                          <button
                            type="button"
                            disabled={
                              isSubmitting ||
                              actionEmployeeId === employee.id ||
                              passwordSetupEmployeeId === employee.id ||
                              testPasswordEmployeeId === employee.id
                            }
                            onClick={() =>
                              setActionMenuEmployeeId((currentId) =>
                                currentId === employee.id ? null : employee.id
                              )
                            }
                            aria-expanded={actionMenuEmployeeId === employee.id}
                            className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Actions
                          </button>

                          {actionMenuEmployeeId === employee.id && (
                            <div className="absolute right-6 z-30 mt-2 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-left shadow-lg">
                              <button
                                type="button"
                                onClick={() => openEditForm(employee)}
                                className="block w-full px-4 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
                              >
                                Edit
                              </button>

                              <button
                                type="button"
                                onClick={() => handleSendPasswordSetup(employee)}
                                className="block w-full px-4 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
                              >
                                {passwordSetupEmployeeId === employee.id
                                  ? "Sending password setup..."
                                  : "Send Password Setup"}
                              </button>

                              {canSetTestPassword && (
                                <button
                                  type="button"
                                  onClick={() => openTestPasswordModal(employee)}
                                  className="block w-full px-4 py-2.5 text-left text-sm font-medium text-amber-700 hover:bg-amber-50"
                                >
                                  {testPasswordEmployeeId === employee.id
                                    ? "Setting test password..."
                                    : "Set Test Password"}
                                  <span className="mt-0.5 block text-xs font-semibold text-amber-600">
                                    Testing only
                                  </span>
                                </button>
                              )}

                              <div className="my-1 border-t border-slate-100" />

                              <button
                                type="button"
                                onClick={() => handleToggleActive(employee)}
                                className={`block w-full px-4 py-2.5 text-left text-sm font-semibold ${
                                  employee.is_active
                                    ? "text-red-700 hover:bg-red-50"
                                    : "text-green-700 hover:bg-green-50"
                                }`}
                              >
                                {actionEmployeeId === employee.id
                                  ? "Updating status..."
                                  : employee.is_active
                                    ? "Deactivate"
                                    : "Reactivate"}
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {testPasswordEmployee && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4 py-6">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="test-password-title"
              className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-xl"
            >
              <div className="border-b border-slate-200 px-5 py-4">
                <p className="text-xs font-bold uppercase tracking-wide text-amber-700">
                  Testing/admin-only
                </p>
                <h2
                  id="test-password-title"
                  className="mt-1 text-lg font-bold text-slate-900"
                >
                  Set Test Password
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  {testPasswordEmployee.full_name}
                </p>
                <p className="text-sm font-medium text-slate-500">
                  {testPasswordEmployee.email}
                </p>
              </div>

              <form onSubmit={handleSetTestPassword} className="space-y-4 px-5 py-5">
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                  This testing-only admin override directly updates the employee
                  password.
                </div>

                {testPasswordMessage && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                    {testPasswordMessage}
                  </div>
                )}

                <FormField
                  label="Password"
                  error={testPasswordErrors.password}
                  required
                >
                  <input
                    type="password"
                    value={testPasswordValues.password}
                    onChange={(event) =>
                      updateTestPasswordValue("password", event.target.value)
                    }
                    disabled={testPasswordEmployeeId !== null}
                    autoComplete="new-password"
                    className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-600 disabled:cursor-not-allowed disabled:bg-slate-50"
                  />
                </FormField>

                <FormField
                  label="Confirm Password"
                  error={testPasswordErrors.confirmPassword}
                  required
                >
                  <input
                    type="password"
                    value={testPasswordValues.confirmPassword}
                    onChange={(event) =>
                      updateTestPasswordValue(
                        "confirmPassword",
                        event.target.value
                      )
                    }
                    disabled={testPasswordEmployeeId !== null}
                    autoComplete="new-password"
                    className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-600 disabled:cursor-not-allowed disabled:bg-slate-50"
                  />
                </FormField>

                <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
                  <button
                    type="button"
                    onClick={closeTestPasswordModal}
                    disabled={testPasswordEmployeeId !== null}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={testPasswordEmployeeId !== null}
                    className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {testPasswordEmployeeId
                      ? "Saving password..."
                      : "Save Password"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function FormField({
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

function SortableTableHeader({
  sortKey,
  sortState,
  onSort,
  children,
}: {
  sortKey: SortKey;
  sortState: SortState;
  onSort: (sortKey: SortKey) => void;
  children: React.ReactNode;
}) {
  const isActive = sortState.key === sortKey;

  return (
    <th className="px-6 py-4 text-sm font-semibold text-slate-600">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1.5 text-left hover:text-slate-900"
      >
        <span>{children}</span>
        <span className="w-3 text-xs text-slate-400">
          {isActive ? (sortState.direction === "asc" ? "▲" : "▼") : ""}
        </span>
      </button>
    </th>
  );
}

function TableHeader({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th className={`px-6 py-4 text-sm font-semibold text-slate-600 ${className}`}>
      {children}
    </th>
  );
}

function TableCell({ children }: { children: React.ReactNode }) {
  return <td className="px-6 py-4 text-sm text-slate-600">{children}</td>;
}
