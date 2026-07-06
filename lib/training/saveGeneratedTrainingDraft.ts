import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { GeneratedTrainingDraft } from "@/lib/training/importDraft";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildSlideBody(slide: GeneratedTrainingDraft["slides"][number]) {
  if (slide.slide_type !== "knowledge_check") return slide.body;

  const answerItems = [
    ["A", slide.answer_a],
    ["B", slide.answer_b],
    ["C", slide.answer_c],
    ["D", slide.answer_d],
  ]
    .map(([label, answer]) => `<li><strong>${label}.</strong> ${escapeHtml(answer)}</li>`)
    .join("");

  const explanationHtml = slide.explanation
    ? `<p><strong>Explanation:</strong> ${escapeHtml(slide.explanation)}</p>`
    : "";

  return `${slide.body}
<p><strong>Knowledge Check:</strong> ${escapeHtml(slide.question_text)}</p>
<ul>${answerItems}</ul>
<p><strong>Correct answer:</strong> ${escapeHtml(slide.correct_answer)}</p>
${explanationHtml}`.trim();
}

export async function saveGeneratedTrainingDraft({
  supabase,
  draft,
  companyId,
  createdBy,
}: {
  supabase: ReturnType<typeof createAdminSupabaseClient>;
  draft: GeneratedTrainingDraft;
  companyId: string;
  createdBy: string;
}) {
  // TODO: Persist learning_objectives when training modules have matching storage.
  const { data: module, error: moduleError } = await supabase
    .from("training_modules")
    .insert({
      title: draft.module.title,
      description: draft.module.description || null,
      category: draft.module.category || null,
      training_audience: "all",
      passing_score: draft.module.passing_score,
      estimated_minutes: draft.module.estimated_minutes,
      status: "draft",
      allow_retake: true,
      max_attempts: null,
      renewal_period_days: null,
      days_allowed: null,
      company_id: companyId,
      created_by: createdBy,
    })
    .select("*")
    .single();

  if (moduleError || !module) {
    return {
      data: null,
      error: moduleError ?? new Error("Training module insert returned no data."),
    };
  }

  const slidesResult = await supabase.from("training_slides").insert(
    draft.slides.map((slide) => ({
      module_id: module.id,
      company_id: companyId,
      slide_order: slide.slide_order,
      title: slide.title,
      body: buildSlideBody(slide),
      image_url: null,
      slide_type: slide.slide_type,
      speaker_notes: slide.coach_note || null,
      estimated_seconds: null,
      is_active: true,
    }))
  );

  if (slidesResult.error) {
    await supabase
      .from("training_modules")
      .delete()
      .eq("id", module.id)
      .eq("company_id", companyId);

    return { data: null, error: slidesResult.error };
  }

  const questionsResult = await supabase.from("quiz_questions").insert(
    draft.quiz.map((question) => ({
      module_id: module.id,
      company_id: companyId,
      question_text: question.question_text,
      question_type: question.question_type,
      answer_a: question.answer_a,
      answer_b: question.answer_b,
      answer_c: question.answer_c,
      answer_d: question.answer_d,
      correct_answer: question.correct_answer,
      points: 1,
      question_order: question.question_order,
      explanation: question.explanation || null,
      is_active: true,
    }))
  );

  if (questionsResult.error) {
    await supabase
      .from("training_modules")
      .delete()
      .eq("id", module.id)
      .eq("company_id", companyId);

    return { data: null, error: questionsResult.error };
  }

  return { data: module, error: null };
}
