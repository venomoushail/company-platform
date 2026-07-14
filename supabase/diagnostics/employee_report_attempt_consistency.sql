-- Development-only diagnostic. Replace the two UUIDs before running in the
-- Supabase SQL editor. Do not expose this output in the application UI.
select
  qa.id as attempt_id,
  qa.assignment_id,
  qa.employee_id,
  qa.module_id,
  qa.attempt_number,
  qa.score as stored_score_percentage,
  qa.correct_answers,
  qa.total_questions,
  case
    when qa.total_questions > 0
      then round((qa.correct_answers::numeric / qa.total_questions) * 100, 1)
    else null
  end as answer_derived_percentage,
  qa.passed as attempt_passed,
  qa.started_at,
  qa.submitted_at as completed_at,
  qa.duration_seconds,
  ta.latest_score as assignment_latest_score,
  ta.passed as assignment_passed,
  ta.status as assignment_status,
  tm.passing_score
from public.quiz_attempts qa
join public.training_assignments ta on ta.id = qa.assignment_id
join public.training_modules tm on tm.id = qa.module_id
where qa.employee_id = '00000000-0000-0000-0000-000000000000'
  and qa.module_id = '00000000-0000-0000-0000-000000000000'
order by qa.attempt_number desc;
