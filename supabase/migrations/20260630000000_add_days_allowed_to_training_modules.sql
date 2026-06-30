alter table public.training_modules
  add column if not exists days_allowed integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'training_modules_days_allowed_positive'
  ) then
    alter table public.training_modules
      add constraint training_modules_days_allowed_positive
      check (days_allowed is null or days_allowed > 0);
  end if;
end $$;
