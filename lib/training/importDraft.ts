export type GeneratedSlideType =
  | "content"
  | "callout"
  | "scenario"
  | "recap"
  | "knowledge_check"
  | "reflection";

export type GeneratedTrainingDraftMetadata = {
  prompt_version: string;
  generation_style: string;
  model: string;
  generated_at: string;
};

export type GeneratedTrainingDraftRecord = GeneratedTrainingDraftMetadata & {
  draft: GeneratedTrainingDraft;
};

export type GeneratedTrainingDraft = {
  module: {
    title: string;
    description: string;
    category: string;
    estimated_minutes: number;
    passing_score: number;
  };
  learning_objectives: string[];
  slides: {
    slide_order: number;
    slide_type: GeneratedSlideType;
    title: string;
    body: string;
    coach_note: string;
    question_text: string;
    answer_a: string;
    answer_b: string;
    answer_c: string;
    answer_d: string;
    correct_answer: "A" | "B" | "C" | "D" | "";
    explanation: string;
  }[];
  quiz: {
    question_order: number;
    question_text: string;
    question_type: "multiple_choice";
    answer_a: string;
    answer_b: string;
    answer_c: string;
    answer_d: string;
    correct_answer: "A" | "B" | "C" | "D";
    explanation: string;
  }[];
};

const correctAnswers = new Set(["A", "B", "C", "D"]);
const slideTypes = new Set<GeneratedSlideType>([
  "content",
  "callout",
  "scenario",
  "recap",
  "knowledge_check",
  "reflection",
]);
const unsafeHtmlBlockPattern =
  /<(script|style|iframe|object|embed|link|meta)[^>]*>[\s\S]*?<\/\1>/gi;
const htmlTagPattern = /<\/?([a-z][a-z0-9]*)[^>]*>/gi;
const allowedAiHtmlTags = new Set(["p", "strong", "em", "ul", "ol", "li", "br"]);

export const generatedTrainingDraftSchema = {
  type: "object",
  additionalProperties: false,
  required: ["module", "learning_objectives", "slides", "quiz"],
  properties: {
    module: {
      type: "object",
      additionalProperties: false,
      required: [
        "title",
        "description",
        "category",
        "estimated_minutes",
        "passing_score",
      ],
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        category: { type: "string" },
        estimated_minutes: { type: "integer", minimum: 1 },
        passing_score: { type: "integer", minimum: 0, maximum: 100 },
      },
    },
    learning_objectives: {
      type: "array",
      minItems: 1,
      items: { type: "string" },
    },
    slides: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "slide_order",
          "slide_type",
          "title",
          "body",
          "coach_note",
          "question_text",
          "answer_a",
          "answer_b",
          "answer_c",
          "answer_d",
          "correct_answer",
          "explanation",
        ],
        properties: {
          slide_order: { type: "integer", minimum: 1 },
          slide_type: {
            type: "string",
            enum: [
              "content",
              "callout",
              "scenario",
              "recap",
              "knowledge_check",
              "reflection",
            ],
          },
          title: { type: "string" },
          body: { type: "string" },
          coach_note: { type: "string" },
          question_text: { type: "string" },
          answer_a: { type: "string" },
          answer_b: { type: "string" },
          answer_c: { type: "string" },
          answer_d: { type: "string" },
          correct_answer: { type: "string", enum: ["A", "B", "C", "D", ""] },
          explanation: { type: "string" },
        },
      },
    },
    quiz: {
      type: "array",
      minItems: 3,
      maxItems: 15,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "question_order",
          "question_text",
          "question_type",
          "answer_a",
          "answer_b",
          "answer_c",
          "answer_d",
          "correct_answer",
          "explanation",
        ],
        properties: {
          question_order: { type: "integer", minimum: 1 },
          question_text: { type: "string" },
          question_type: { type: "string", enum: ["multiple_choice"] },
          answer_a: { type: "string" },
          answer_b: { type: "string" },
          answer_c: { type: "string" },
          answer_d: { type: "string" },
          correct_answer: { type: "string", enum: ["A", "B", "C", "D"] },
          explanation: { type: "string" },
        },
      },
    },
  },
} as const;

function readObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getDraftPayload(value: unknown) {
  const root = readObject(value);
  if (!root) return null;

  return readObject(root.draft) ?? root;
}

export function getGeneratedTrainingDraftMetadata(
  value: unknown
): GeneratedTrainingDraftMetadata | null {
  const root = readObject(value);
  if (!root || !readObject(root.draft)) return null;

  const promptVersion = readString(root.prompt_version);
  const generationStyle = readString(root.generation_style);
  const model = readString(root.model);
  const generatedAt = readString(root.generated_at);

  if (!promptVersion && !generationStyle && !model && !generatedAt) return null;

  return {
    prompt_version: promptVersion,
    generation_style: generationStyle,
    model,
    generated_at: generatedAt,
  };
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readInteger(value: unknown, fallback: number) {
  const numberValue = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numberValue)) return fallback;

  return Math.trunc(numberValue);
}

function sanitizeAiSlideHtml(value: string) {
  return value
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(unsafeHtmlBlockPattern, "")
    .replace(htmlTagPattern, (match, rawTagName: string) => {
      const tagName = rawTagName.toLowerCase();

      if (!allowedAiHtmlTags.has(tagName)) return "";
      if (match.startsWith("</")) return tagName === "br" ? "" : `</${tagName}>`;
      if (tagName === "br") return "<br>";

      return `<${tagName}>`;
    })
    .trim();
}

export function normalizeGeneratedTrainingDraft(
  value: unknown
): GeneratedTrainingDraft | null {
  const root = getDraftPayload(value);
  if (!root) return null;

  const moduleDraft = readObject(root.module);
  if (!moduleDraft) return null;

  const title = readString(moduleDraft.title);
  const description = readString(moduleDraft.description);
  const category = readString(moduleDraft.category);
  const estimatedMinutes = readInteger(moduleDraft.estimated_minutes, 20);
  const passingScore = readInteger(moduleDraft.passing_score, 80);

  if (!title) return null;

  const learningObjectives = Array.isArray(root.learning_objectives)
    ? root.learning_objectives.map(readString).filter(Boolean)
    : [];

  const slides = Array.isArray(root.slides)
    ? root.slides
        .map((slide, index) => {
          const slideObject = readObject(slide);
          if (!slideObject) return null;

          const slideTitle = readString(slideObject.title);
          const body = sanitizeAiSlideHtml(readString(slideObject.body));
          const slideType = readString(slideObject.slide_type);
          const correctAnswer = readString(slideObject.correct_answer).toUpperCase();

          if (!slideTitle || !body || !slideTypes.has(slideType as GeneratedSlideType)) {
            return null;
          }

          if (
            slideType === "knowledge_check" &&
            (!readString(slideObject.question_text) ||
              !readString(slideObject.answer_a) ||
              !readString(slideObject.answer_b) ||
              !readString(slideObject.answer_c) ||
              !readString(slideObject.answer_d) ||
              !correctAnswers.has(correctAnswer))
          ) {
            return null;
          }

          return {
            slide_order: readInteger(slideObject.slide_order, index + 1),
            slide_type: slideType as GeneratedSlideType,
            title: slideTitle,
            body,
            coach_note: readString(slideObject.coach_note),
            question_text: readString(slideObject.question_text),
            answer_a: readString(slideObject.answer_a),
            answer_b: readString(slideObject.answer_b),
            answer_c: readString(slideObject.answer_c),
            answer_d: readString(slideObject.answer_d),
            correct_answer: correctAnswers.has(correctAnswer)
              ? (correctAnswer as GeneratedTrainingDraft["slides"][number]["correct_answer"])
              : "",
            explanation: readString(slideObject.explanation),
          };
        })
        .filter((slide): slide is GeneratedTrainingDraft["slides"][number] =>
          Boolean(slide)
        )
    : [];

  const quiz = Array.isArray(root.quiz)
    ? root.quiz
        .map((question, index) => {
          const questionObject = readObject(question);
          if (!questionObject) return null;

          const correctAnswer = readString(questionObject.correct_answer).toUpperCase();

          if (!correctAnswers.has(correctAnswer)) return null;

          const normalizedQuestion = {
            question_order: readInteger(questionObject.question_order, index + 1),
            question_text: readString(questionObject.question_text),
            question_type: "multiple_choice" as const,
            answer_a: readString(questionObject.answer_a),
            answer_b: readString(questionObject.answer_b),
            answer_c: readString(questionObject.answer_c),
            answer_d: readString(questionObject.answer_d),
            correct_answer: correctAnswer as GeneratedTrainingDraft["quiz"][number]["correct_answer"],
            explanation: readString(questionObject.explanation),
          };

          if (
            !normalizedQuestion.question_text ||
            !normalizedQuestion.answer_a ||
            !normalizedQuestion.answer_b ||
            !normalizedQuestion.answer_c ||
            !normalizedQuestion.answer_d
          ) {
            return null;
          }

          return normalizedQuestion;
        })
        .filter((question): question is GeneratedTrainingDraft["quiz"][number] =>
          Boolean(question)
        )
    : [];

  if (slides.length === 0 || quiz.length === 0) return null;

  return {
    module: {
      title,
      description,
      category,
      estimated_minutes: Math.max(1, estimatedMinutes),
      passing_score: Math.min(100, Math.max(0, passingScore)),
    },
    learning_objectives: learningObjectives,
    slides: slides.map((slide, index) => ({
      ...slide,
      slide_order: index + 1,
    })),
    quiz: quiz.map((question, index) => ({
      ...question,
      question_order: index + 1,
    })),
  };
}
