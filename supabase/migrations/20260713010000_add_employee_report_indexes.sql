create index if not exists training_assignments_employee_due_date_idx
  on public.training_assignments (employee_id, due_date);

create index if not exists quiz_attempts_company_assignment_attempt_idx
  on public.quiz_attempts (company_id, assignment_id, attempt_number desc);

create index if not exists profiles_company_location_active_idx
  on public.profiles (company_id, location_id, is_active);

create index if not exists employee_positions_employee_position_idx
  on public.employee_positions (employee_id, position_id);
