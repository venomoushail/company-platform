import type { GenerationStyle, RestaurantTrainingPromptMessage } from "./index";

const styleInstructions: Record<GenerationStyle, string> = {
  standard:
    "Create a balanced course. For a medium source document, prefer 12-18 strong slides unless the content clearly needs more or less.",
  beginner_friendly:
    "Use simpler language with slightly more explanation, examples, and reinforcement so new employees can follow the material comfortably.",
  detailed:
    "Preserve more source detail, use more slides when helpful, and include broader quiz coverage of procedures, judgment calls, and real-world decisions.",
  executive_summary:
    "Create fewer slides with a high-level overview, focus on leadership-ready takeaways, and include a shorter final quiz.",
};

export function buildRestaurantTrainingInputV2(
  extractedText: string,
  generationStyle: GenerationStyle
): RestaurantTrainingPromptMessage[] {
  return [
    {
      role: "system",
      content:
        "You are an expert restaurant instructional designer. Return valid JSON only.",
    },
    {
      role: "user",
      content: `Generate a complete editable restaurant employee training draft from the source document.

Generation style:
${styleInstructions[generationStyle]}

Instructional design rules:
- Keep the training focused on restaurant operations, service, safety, compliance, and employee performance.
- Do not simply summarize the document. Teach, explain, reinforce, and apply the material like an instructional designer.
- Every slide should have enough teaching value to stand on its own.
- Avoid extremely thin slides such as "We are a team. We show up. We help."
- Lightly elaborate when it helps the learner understand why the material matters, but do not invent company policy.
- Add practical restaurant examples when they naturally follow from the source.
- Add real-world scenario slides where employees should practice judgment or apply a procedure.
- Add recap or reinforcement slides every 4-6 content slides when appropriate.
- Use callout slides for especially important warnings, reminders, or memorable takeaways.
- Use knowledge_check slides only for lesson reinforcement. They are separate from the final quiz.
- Return valid JSON only.
- Do not include markdown fences or commentary outside the JSON object.
- Slide body must be safe HTML, not markdown.
- Allowed slide body tags: p, strong, em, ul, ol, li, br.
- Each slide should teach one main idea.
- Important acronyms, mantras, or frameworks such as TIPS, SAFE, and HEARD should become memorable teaching moments with dedicated slides or slide groups.
- Do not invent company policies, brand standards, legal requirements, or procedures that are not supported by the source document.
- Preserve important source details while removing repetition.
- Quiz questions should test understanding and real-world application, not memorization alone.
- The final quiz belongs in the top-level "quiz" array only.

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
      "correct_answer": "A",
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

Slide type rules:
- slide_type must be one of: content, callout, scenario, recap, knowledge_check.
- content slides teach core material.
- callout slides emphasize a critical warning, reminder, or standard.
- scenario slides describe a realistic restaurant situation and how to think through it.
- recap slides reinforce the most important points from the previous section.
- knowledge_check slides ask one ungraded lesson question. Include question_text, answers A-D, correct_answer, and explanation for knowledge_check slides. For all other slide types, use empty strings for those optional fields.

Source document:
${extractedText}`,
    },
  ];
}
