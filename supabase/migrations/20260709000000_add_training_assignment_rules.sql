create table if not exists public.training_assignment_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  module_id uuid not null references public.training_modules(id) on delete cascade,
  rule_type text not null check (
    rule_type in ('all_employees', 'position', 'location', 'position_location')
  ),
  position_id uuid references public.positions(id) on delete restrict,
  location_id uuid references public.locations(id) on delete restrict,
  assign_on_hire boolean not null default true,
  assign_on_position_change boolean not null default true,
  assign_on_location_change boolean not null default true,
  days_allowed integer,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_assignment_rules_days_allowed_positive
    check (days_allowed is null or days_allowed > 0),
  constraint training_assignment_rules_position_required
    check (
      (rule_type not in ('position', 'position_location') and position_id is null)
      or
      (rule_type in ('position', 'position_location') and position_id is not null)
    ),
  constraint training_assignment_rules_location_required
    check (
      (rule_type not in ('location', 'position_location') and location_id is null)
      or
      (rule_type in ('location', 'position_location') and location_id is not null)
    )
);

create index if not exists training_assignment_rules_company_id_idx
  on public.training_assignment_rules(company_id);

create index if not exists training_assignment_rules_module_id_idx
  on public.training_assignment_rules(module_id);

create index if not exists training_assignment_rules_active_idx
  on public.training_assignment_rules(company_id, is_active);

alter table public.training_assignments
  add column if not exists due_date timestamptz;

-- If this environment already has a trigger utility for updated_at, replace this
-- manual timestamp handling with that shared trigger.
