import type { GenerationStyle } from "@/lib/ai/prompts/restaurantTraining";

export type CurriculumBuilderPromptMessage = {
  role: "system" | "user";
  content: string;
};

const styleInstructions: Record<GenerationStyle, string> = {
  standard:
    "Recommend practical modules with balanced depth for restaurant onboarding.",
  beginner_friendly:
    "Favor foundational onboarding topics, simpler titles, and extra clarity for brand-new employees.",
  detailed:
    "Preserve more policy nuance by splitting clearly distinct training needs when the source supports it.",
  executive_summary:
    "Recommend fewer, higher-level modules that leadership could prioritize first.",
};

export function buildCurriculumBuilderInputV1(
  extractedText: string,
  generationStyle: GenerationStyle
): CurriculumBuilderPromptMessage[] {
  return [
    {
      role: "system",
      content:
        "You are an expert restaurant onboarding curriculum designer. Return valid JSON only.",
    },
    {
      role: "user",
      content: `Analyze the source document and suggest a practical training library. Do not generate full slides yet.

Generation style:
${styleInstructions[generationStyle]}

Curriculum design rules:
- Identify teachable topics from large documents like employee handbooks.
- Prefer 4-10 recommended modules for a full handbook.
- Do not recommend tiny modules that would be better merged.
- Separate topics when they represent different training needs, such as company culture, hospitality/customer service, attendance, appearance/uniforms, harassment/workplace conduct, safety/sanitation, cash handling/timekeeping, and open door/reporting concerns.
- Keep recommendations practical for restaurant onboarding.
- Stay faithful to the source document. Do not invent policies or requirements.
- Use module_order values starting at 1 with no gaps.
- estimated_minutes should usually be 8-25.
- suggested_slide_count should usually be 6-14.
- suggested_quiz_question_count should usually be 3-8.
- Return valid JSON only. Do not include markdown fences or commentary.

JSON shape:
{
  "curriculum_title": "",
  "description": "",
  "recommended_modules": [
    {
      "module_order": 1,
      "title": "",
      "description": "",
      "category": "",
      "estimated_minutes": 10,
      "recommended_audience": "all",
      "why_this_should_be_separate": "",
      "source_topic_summary": "",
      "suggested_slide_count": 8,
      "suggested_quiz_question_count": 5
    }
  ]
}

Source document:
${extractedText}`,
    },
  ];
}
