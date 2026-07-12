import type { GenerationStyle, RestaurantTrainingPromptMessage } from "./index";

const styleInstructions: Record<GenerationStyle, string> = {
  standard:
    "Create a balanced interactive course. For a medium focused document, prefer approximately 14-20 total learning blocks, with interaction every 3-5 blocks when it improves learning.",
  beginner_friendly:
    "Use simpler language, more practical examples, slightly more reinforcement blocks, and more explanation for brand-new employees.",
  detailed:
    "Preserve more source detail and procedures. You may use more content blocks, but still choose interaction where it helps employees apply the material.",
  executive_summary:
    "Create fewer blocks with high-level content, callouts, and recap. Use limited interaction and a shorter quiz. Do not create an overly long or overly interactive course.",
};

export function buildRestaurantTrainingInputV4(
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

You are not creating a PowerPoint deck. You are designing an interactive learning experience.

Generation style:
${styleInstructions[generationStyle]}

Instructional-design philosophy:
- Select the most effective Learning Block type for each concept.
- Vary pacing and presentation. Avoid long sequences of content-only blocks.
- Teach, reinforce, apply, and summarize.
- Preserve source policies exactly. Never invent company requirements, brand standards, legal requirements, or procedures.
- Explain why behaviors matter when that why is supported by the source.
- Use practical restaurant examples when they naturally follow from the source.
- Keep the course useful for a brand-new employee.
- Include a Course Overview near the beginning.
- Include a Course Summary near the end before the graded quiz.
- Avoid more than 3 consecutive content blocks when another block type would improve learning.

Learning Block types:

CONTENT
- Use for concepts, policies, procedures, definitions, short paragraphs, and lists.
- One main teaching idea per block.
- Use safe HTML in body.
- Avoid walls of text. Prefer 75-200 words unless the generation style calls for more or less.
- Config: { "layout": "standard" }

CALLOUT
- Use for memorable principles, critical warnings, company mantras, "Remember this" messages, and powerful statements.
- Keep concise. Do not use for ordinary paragraphs.
- It should visually and conceptually interrupt the course.
- Config: { "emphasis": "key_takeaway" }

KNOWLEDGE CHECK
- Use for ungraded reinforcement after an important concept.
- It is not part of the final graded quiz.
- Use 2-4 plausible answers. Provide one correct answer and useful feedback.
- Prefer application or comprehension over trivia.
- Do not repeat the exact same question in the final quiz.
- Put the interaction in config, not body.
- Config:
{
  "question": "",
  "answers": [
    { "id": "a", "text": "" },
    { "id": "b", "text": "" }
  ],
  "correctAnswerId": "a",
  "explanation": "",
  "allowRetry": true
}

SCENARIO
- Use for realistic restaurant decisions: guest complaints, teamwork, service recovery, safety, attendance, conduct, or judgment.
- Present a believable situation. Ask what the learner should do.
- Use 2-4 plausible responses. Identify the best response and explain why.
- Do not invent authority, remedies, or policies not found in the source.
- Put the interaction in config, not body.
- Config:
{
  "scenarioText": "",
  "question": "",
  "answers": [
    { "id": "a", "text": "" },
    { "id": "b", "text": "" }
  ],
  "correctAnswerId": "a",
  "explanation": "",
  "allowRetry": true
}

REFLECTION
- Use for culture, hospitality, values, leadership, personal application, or recalling prior work experiences.
- Ask a meaningful question.
- Do not use reflection for facts or compliance testing.
- Usually keep response optional unless the source strongly supports requiring acknowledgment.
- Do not ask for sensitive personal information.
- Config:
{
  "prompt": "",
  "placeholder": "",
  "responseRequired": false
}

RECAP
- Use to summarize a meaningful section, transition between major topics, or close the course.
- Include 3-6 concise takeaways and a strong closing or transition message.
- Do not simply repeat entire paragraphs.
- Config:
{
  "items": [""],
  "closingMessage": ""
}

IMAGE HOTSPOT
- Use only when visual exploration materially improves learning, such as uniform standards, workstation setup, food storage, safety hazards, equipment parts, cleaning targets, dining room readiness, or correct placement/appearance.
- The AI does not have the final image. Do not invent xPercent/yPercent coordinates.
- Provide a placeholder config the admin can finish in the builder.
- Include imageSuggestion and suggestedHotspots only from source-supported details.
- Mark requiresAdminSetup true.
- Avoid image_hotspot if content or scenario teaches the idea just as well.
- Config:
{
  "imageUrl": "",
  "instruction": "",
  "hotspots": [],
  "requireAllHotspots": true,
  "requiresAdminSetup": true,
  "imageSuggestion": "",
  "suggestedHotspots": [
    { "title": "", "description": "" }
  ]
}

Course composition guidelines:
- 45-65% content/callout.
- 10-20% knowledge checks.
- 5-15% scenarios.
- 5-10% reflection.
- 5-15% recap.
- Image hotspots only when visually justified.
- These are guidelines, not rigid quotas. Do not force every type into every course.

Output rules:
- Return valid JSON only.
- Do not include markdown fences or commentary outside the JSON object.
- Preserve the existing slides field names for compatibility.
- Slide body must be safe HTML, not markdown.
- Allowed slide body tags: p, strong, em, ul, ol, li, br.
- Do not embed interactive question markup into body when config supports the interaction.
- Keep body concise for interactive blocks; primary interactive data belongs in config.
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
      "explanation": "",
      "config": {
        "layout": "standard",
        "question": null,
        "answers": [],
        "correctAnswerId": null,
        "explanation": null,
        "allowRetry": null,
        "scenarioText": null,
        "prompt": null,
        "placeholder": null,
        "responseRequired": null,
        "items": [],
        "closingMessage": null,
        "imageUrl": null,
        "instruction": null,
        "hotspots": [],
        "requireAllHotspots": null,
        "requiresAdminSetup": null,
        "imageSuggestion": null,
        "suggestedHotspots": [],
        "emphasis": null
      }
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
- slide_type must be one of: content, callout, scenario, recap, knowledge_check, reflection, image_hotspot.
- For content, callout, and recap, body should contain useful safe HTML.
- For knowledge_check, scenario, reflection, recap, image_hotspot, and callout, config must match the block type.
- Every config object must include every config key shown above. Use null for irrelevant scalar fields and [] for irrelevant array fields.
- For non-legacy compatibility fields question_text, answer_a, answer_b, answer_c, answer_d, correct_answer, and explanation: use empty strings unless the block is a knowledge_check or scenario. For v4, config is authoritative.
- Use stable, unique answer IDs within each generated block, such as "a", "b", "c", "d".

Final quiz rules:
- Generate 5-10 graded multiple-choice questions depending on course scope.
- Test application and understanding.
- Cover the most important objectives.
- Avoid duplicating knowledge checks word-for-word.
- Avoid trick questions.
- Do not test content that was not taught.
- Preserve company policies accurately.

Source document:
${extractedText}`,
    },
  ];
}
