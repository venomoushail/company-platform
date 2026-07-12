alter table public.training_slides
add column if not exists config_json jsonb not null default '{}'::jsonb;

do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select conname
    from pg_constraint
    where conrelid = 'public.training_slides'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%slide_type%'
  loop
    execute format(
      'alter table public.training_slides drop constraint if exists %I',
      constraint_record.conname
    );
  end loop;
end $$;

alter table public.training_slides
add constraint training_slides_slide_type_check
check (
  slide_type <> ''
  and (
    slide_type in (
    'content',
    'knowledge_check',
    'image_hotspot',
    'scenario',
    'reflection',
    'recap',
    'callout'
  )
    or slide_type is not null
  )
);
