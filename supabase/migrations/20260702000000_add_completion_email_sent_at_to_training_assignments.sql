alter table public.training_assignments
  add column if not exists completion_email_sent_at timestamptz;
