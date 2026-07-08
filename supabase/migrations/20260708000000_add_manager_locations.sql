create table if not exists public.manager_locations (
  manager_id uuid not null references public.profiles(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (manager_id, location_id)
);

create index if not exists manager_locations_company_id_idx
  on public.manager_locations(company_id);

create index if not exists manager_locations_location_id_idx
  on public.manager_locations(location_id);
