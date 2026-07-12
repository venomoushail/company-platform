import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { GeneratedTrainingDraft } from "@/lib/training/importDraft";
import type {
  KnowledgeCheckConfig,
  ScenarioBlockConfig,
} from "@/types/learningBlocks";

function buildSlideBody(slide: GeneratedTrainingDraft["slides"][number]) {
  if (slide.slide_type === "knowledge_check" || slide.slide_type === "scenario") {
    return slide.body;
  }

  return slide.body;
}

function answerId(label: string) {
  return `answer-${label.toLowerCase()}`;
}

function buildSlideConfig(slide: GeneratedTrainingDraft["slides"][number]) {
  if (slide.config && Object.keys(slide.config).length > 0) {
    return slide.config;
  }

  if (slide.slide_type === "knowledge_check") {
    const answers = [
      ["A", slide.answer_a],
      ["B", slide.answer_b],
      ["C", slide.answer_c],
      ["D", slide.answer_d],
    ]
      .filter(([, answer]) => answer.trim())
      .map(([label, answer]) => ({
        id: answerId(label),
        text: answer,
      }));

    return {
      question: slide.question_text,
      answers,
      correctAnswerId: answerId(slide.correct_answer || "A"),
      explanation: slide.explanation,
      allowRetry: true,
    } satisfies KnowledgeCheckConfig;
  }

  if (slide.slide_type === "scenario") {
    const answers = [
      ["A", slide.answer_a],
      ["B", slide.answer_b],
      ["C", slide.answer_c],
      ["D", slide.answer_d],
    ]
      .filter(([, answer]) => answer.trim())
      .map(([label, answer]) => ({
        id: answerId(label),
        text: answer,
      }));

    return {
      scenarioText: slide.body,
      question: slide.question_text || "What should the employee do next?",
      answers,
      correctAnswerId: answerId(slide.correct_answer || "A"),
      explanation: slide.explanation,
      allowRetry: true,
    } satisfies ScenarioBlockConfig;
  }

  if (slide.slide_type === "reflection") {
    return {
      prompt: slide.body,
      placeholder: "Write your response here...",
      responseRequired: false,
    };
  }

  if (slide.slide_type === "recap") {
    return {
      items: [slide.body.replace(/<[^>]*>/g, " ").trim()].filter(Boolean),
      closingMessage: "",
    };
  }

  if (slide.slide_type === "image_hotspot") {
    return {
      imageUrl: "",
      instruction: "",
      hotspots: [],
      requireAllHotspots: true,
      requiresAdminSetup: true,
      imageSuggestion: "",
      suggestedHotspots: [],
    };
  }

  if (slide.slide_type === "callout") {
    return {
      emphasis: "key_takeaway",
    };
  }

  return {
    layout: "standard",
  };
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
      config_json: buildSlideConfig(slide),
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
