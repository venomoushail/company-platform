import type { GenerationStyle, RestaurantTrainingPromptMessage } from "./index";

const styleInstructions: Record<GenerationStyle, string> = {
  standard:
    "Create a balanced learning experience. For a medium-length source document, prefer 14-18 strong slides unless the content clearly needs more or less.",
  beginner_friendly:
    "Use simpler language with slightly more explanation, examples, reinforcement, and context for employees who are new to the topic.",
  detailed:
    "Preserve more source content, explain the why behind important behaviors, and use more slides when needed to teach procedures and judgment clearly.",
  executive_summary:
    "Create fewer slides with a high-level overview, leadership-ready takeaways, memorable principles, and a shorter final quiz.",
};

export function buildRestaurantTrainingInputV3(
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
      content: `Create a complete editable restaurant employee training draft from the source document.

Generation style:
${styleInstructions[generationStyle]}

Instructional design goal:
- Create a learning experience, not just a course summary.
- Teach the "why" behind behaviors whenever possible so employees understand the purpose, not only the rule.
- Preserve the company's intent, tone, priorities, and values.
- Do not invent company policies, brand standards, legal requirements, or procedures that are not supported by the source document.
- Lightly elaborate when it helps the learner understand or apply the material, but stay faithful to the source.

Pacing and slide quality:
- Prefer 14-18 strong slides for a medium-length document.
- Every slide should have enough teaching value to stand on its own.
- Avoid thin slides that only contain a few short bullets.
- If a slide is too thin, merge it with a related concept or expand it with practical explanation, examples, or learner guidance.
- Each slide should teach one main idea.
- Include a Course Overview slide near the beginning with the learning objectives.
- Include a Course Summary slide near the end before the final quiz.
- Every 3-5 slides, include one engagement slide when appropriate: scenario, reflection, knowledge_check, recap, or callout.

Engagement and application:
- Use practical restaurant examples when they naturally follow from the source.
- Make acronyms and frameworks like TIPS, SAFE, and HEARD memorable teaching moments with dedicated slides or slide groups.
- Scenario slides should put the employee in a realistic restaurant situation and show how to think through it.
- Reflection slides should ask the learner to think about a real experience or how they would apply the concept.
- Knowledge checks should reinforce the lesson and should not duplicate final quiz questions.
- Recap slides should be strong and memorable, not just a list.
- Callout slides should highlight key principles, quotes, or "remember this" ideas.
- Quiz questions should test understanding and real-world application, not memorization alone.

Output rules:
- Return valid JSON only.
- Do not include markdown fences or commentary outside the JSON object.
- Slide body must be safe HTML, not markdown.
- Allowed slide body tags: p, strong, em, ul, ol, li, br.
- Do not use markdown syntax in slide body.
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

Slide type rules:
- slide_type must be one of: content, callout, scenario, recap, knowledge_check, reflection.
- content slides teach core material.
- callout slides emphasize a critical warning, quote, principle, reminder, or standard.
- scenario slides describe a realistic restaurant situation and how the employee should think through it.
- recap slides reinforce and connect the most important points from the previous section.
- knowledge_check slides ask one ungraded lesson question. Include question_text, answers A-D, correct_answer, and explanation for knowledge_check slides.
- reflection slides ask the learner to think about a real experience or how they would apply the concept.
- For non-knowledge_check slides, use empty strings for question_text, answer_a, answer_b, answer_c, answer_d, correct_answer, and explanation.

Source document:
${extractedText}`,
    },
  ];
}
