do $$
declare
  constraint_name text;
begin
  select conname
  into constraint_name
  from pg_constraint
  where conrelid = 'public.training_import_jobs'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%status%';

  if constraint_name is not null then
    execute format(
      'alter table public.training_import_jobs drop constraint %I',
      constraint_name
    );
  end if;
end $$;

alter table public.training_import_jobs
add constraint training_import_jobs_status_check
check (
  status in (
    'uploaded',
    'extracting',
    'text_ready',
    'failed',
    'generating',
    'draft_ready',
    'draft_created',
    'curriculum_generating',
    'curriculum_ready',
    'curriculum_failed',
    'modules_generating',
    'modules_created'
  )
);
