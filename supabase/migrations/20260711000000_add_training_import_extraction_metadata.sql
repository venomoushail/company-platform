alter table public.training_import_jobs
add column if not exists extraction_method text null,
add column if not exists extraction_confidence numeric null,
add column if not exists page_count integer null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'training_import_jobs_extraction_method_check'
  ) then
    alter table public.training_import_jobs
    add constraint training_import_jobs_extraction_method_check
    check (
      extraction_method is null
      or extraction_method in (
        'docx',
        'txt',
        'pdf_embedded_text',
        'pdf_ocr',
        'manual_paste'
      )
    );
  end if;
end $$;
