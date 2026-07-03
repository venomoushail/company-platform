export type GeneratedTrainingDraft = {
  module: {
    title: string;
    description: string;
    category: string;
    estimated_minutes: number;
    passing_score: number;
  };
  slides: {
    slide_order: number;
    title: string;
    body: string;
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

export const generatedTrainingDraftSchema = {
  type: "object",
  additionalProperties: false,
  required: ["module", "slides", "quiz"],
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
    slides: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["slide_order", "title", "body"],
        properties: {
          slide_order: { type: "integer", minimum: 1 },
          title: { type: "string" },
          body: { type: "string" },
        },
      },
    },
    quiz: {
      type: "array",
      minItems: 5,
      maxItems: 10,
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

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readInteger(value: unknown, fallback: number) {
  const numberValue = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numberValue)) return fallback;

  return Math.trunc(numberValue);
}

export function normalizeGeneratedTrainingDraft(
  value: unknown
): GeneratedTrainingDraft | null {
  const root = readObject(value);
  if (!root) return null;

  const moduleDraft = readObject(root.module);
  if (!moduleDraft) return null;

  const title = readString(moduleDraft.title);
  const description = readString(moduleDraft.description);
  const category = readString(moduleDraft.category);
  const estimatedMinutes = readInteger(moduleDraft.estimated_minutes, 20);
  const passingScore = readInteger(moduleDraft.passing_score, 80);

  if (!title) return null;

  const slides = Array.isArray(root.slides)
    ? root.slides
        .map((slide, index) => {
          const slideObject = readObject(slide);
          if (!slideObject) return null;

          const slideTitle = readString(slideObject.title);
          const body = readString(slideObject.body);

          if (!slideTitle || !body) return null;

          return {
            slide_order: readInteger(slideObject.slide_order, index + 1),
            title: slideTitle,
            body,
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
