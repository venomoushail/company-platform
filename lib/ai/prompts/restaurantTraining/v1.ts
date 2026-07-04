import type { GenerationStyle, RestaurantTrainingPromptMessage } from "./index";

const styleInstructions: Record<GenerationStyle, string> = {
  standard: "Create a balanced course with practical quiz coverage.",
  beginner_friendly:
    "Use simpler language and add a little more explanation for new employees.",
  detailed:
    "Preserve more source detail and include broader quiz coverage of key procedures.",
  executive_summary:
    "Create fewer slides with a high-level overview and a shorter final quiz.",
};

export function buildRestaurantTrainingInputV1(
  extractedText: string,
  generationStyle: GenerationStyle
): RestaurantTrainingPromptMessage[] {
  return [
    {
      role: "system",
      content:
        "You are an expert instructional designer creating employee training. Return valid JSON only.",
    },
    {
      role: "user",
      content: `Generate a complete editable training draft from the source document.

Generation style:
${styleInstructions[generationStyle]}

Rules:
- Split the material naturally into lessons/slides.
- Create informative slide titles.
- Use paragraphs.
- Use bullet lists where appropriate.
- Keep each slide approximately 150-250 words.
- Preserve important information.
- Remove repetitive wording.
- Estimate course length in minutes.
- Create 5-10 quiz questions covering the most important material.
- Return valid JSON only.

JSON shape:
{
  "module": {
    "title": "",
    "description": "",
    "category": "",
    "estimated_minutes": 20,
    "passing_score": 80
  },
  "learning_objectives": [
    ""
  ],
  "slides": [
    {
      "slide_order": 1,
      "slide_type": "content",
      "title": "",
      "body": "",
      "coach_note": "",
      "question_text": "",
      "answer_a": "",
      "answer_b": "",
      "answer_c": "",
      "answer_d": "",
      "correct_answer": "",
      "explanation": ""
    }
  ],
  "quiz": [
    {
      "question_order": 1,
      "question_text": "",
      "question_type": "multiple_choice",
      "answer_a": "",
      "answer_b": "",
      "answer_c": "",
      "answer_d": "",
      "correct_answer": "A",
      "explanation": ""
    }
  ]
}

Source document:
${extractedText}`,
    },
  ];
}
