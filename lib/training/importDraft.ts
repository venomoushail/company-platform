import {
  normalizeLearningBlockConfig,
  validateLearningBlockConfig,
  type LearningBlockType,
} from "@/types/learningBlocks";
import { normalizeCategorySlug } from "@/lib/training/formatCategoryLabel";

export type GeneratedSlideType =
  | "content"
  | "callout"
  | "scenario"
  | "recap"
  | "knowledge_check"
  | "reflection"
  | "image_hotspot";

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
    config: Record<string, unknown>;
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
  "image_hotspot",
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

const generatedTrainingDraftV4ConfigSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "layout",
    "question",
    "answers",
    "correctAnswerId",
    "explanation",
    "allowRetry",
    "scenarioText",
    "prompt",
    "placeholder",
    "responseRequired",
    "items",
    "closingMessage",
    "imageUrl",
    "instruction",
    "hotspots",
    "requireAllHotspots",
    "requiresAdminSetup",
    "imageSuggestion",
    "suggestedHotspots",
    "emphasis",
  ],
  properties: {
    layout: { type: ["string", "null"] },
    question: { type: ["string", "null"] },
    answers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "text"],
        properties: {
          id: { type: "string" },
          text: { type: "string" },
        },
      },
    },
    correctAnswerId: { type: ["string", "null"] },
    explanation: { type: ["string", "null"] },
    allowRetry: { type: ["boolean", "null"] },
    scenarioText: { type: ["string", "null"] },
    prompt: { type: ["string", "null"] },
    placeholder: { type: ["string", "null"] },
    responseRequired: { type: ["boolean", "null"] },
    items: {
      type: "array",
      items: { type: "string" },
    },
    closingMessage: { type: ["string", "null"] },
    imageUrl: { type: ["string", "null"] },
    instruction: { type: ["string", "null"] },
    hotspots: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "xPercent",
          "yPercent",
          "radiusPercent",
          "title",
          "description",
          "isRequired",
        ],
        properties: {
          id: { type: "string" },
          xPercent: { type: "number" },
          yPercent: { type: "number" },
          radiusPercent: { type: ["number", "null"] },
          title: { type: "string" },
          description: { type: "string" },
          isRequired: { type: ["boolean", "null"] },
        },
      },
    },
    requireAllHotspots: { type: ["boolean", "null"] },
    requiresAdminSetup: { type: ["boolean", "null"] },
    imageSuggestion: { type: ["string", "null"] },
    suggestedHotspots: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "description"],
        properties: {
          title: { type: "string" },
          description: { type: "string" },
        },
      },
    },
    emphasis: { type: ["string", "null"] },
  },
} as const;

export const generatedTrainingDraftV4Schema = {
  ...generatedTrainingDraftSchema,
  properties: {
    ...generatedTrainingDraftSchema.properties,
    slides: {
      ...generatedTrainingDraftSchema.properties.slides,
      items: {
        ...generatedTrainingDraftSchema.properties.slides.items,
        required: [
          ...generatedTrainingDraftSchema.properties.slides.items.required,
          "config",
        ],
        properties: {
          ...generatedTrainingDraftSchema.properties.slides.items.properties,
          slide_type: {
            type: "string",
            enum: [
              "content",
              "callout",
              "scenario",
              "recap",
              "knowledge_check",
              "reflection",
              "image_hotspot",
            ],
          },
          config: {
            ...generatedTrainingDraftV4ConfigSchema,
          },
        },
      },
    },
  },
} as const;

export function getGeneratedTrainingDraftSchema(promptVersion: string) {
  return promptVersion === "v4"
    ? generatedTrainingDraftV4Schema
    : generatedTrainingDraftSchema;
}

function isSchemaObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function findStrictSchemaIssues(schema: unknown, path = "schema"): string[] {
  if (!isSchemaObject(schema)) return [];

  const issues: string[] = [];
  const schemaType = schema.type;
  const typeValues = Array.isArray(schemaType) ? schemaType : [schemaType];

  if (typeValues.includes("object")) {
    if (schema.additionalProperties !== false) {
      issues.push(`${path} is an object schema without additionalProperties: false.`);
    }

    if (!isSchemaObject(schema.properties)) {
      issues.push(`${path} is an object schema without a properties object.`);
    } else {
      const propertyNames = Object.keys(schema.properties);
      const required = Array.isArray(schema.required) ? schema.required : [];

      for (const propertyName of propertyNames) {
        if (!required.includes(propertyName)) {
          issues.push(`${path}.${propertyName} is defined but not required.`);
        }
      }

      for (const requiredProperty of required) {
        if (
          typeof requiredProperty !== "string" ||
          !(requiredProperty in schema.properties)
        ) {
          issues.push(`${path} requires unknown property ${String(requiredProperty)}.`);
        }
      }
    }
  }

  for (const [key, value] of Object.entries(schema)) {
    if (key === "properties" && isSchemaObject(value)) {
      for (const [propertyName, propertySchema] of Object.entries(value)) {
        issues.push(...findStrictSchemaIssues(propertySchema, `${path}.${propertyName}`));
      }
      continue;
    }

    if (key === "$defs" && isSchemaObject(value)) {
      for (const [definitionName, definitionSchema] of Object.entries(value)) {
        issues.push(
          ...findStrictSchemaIssues(definitionSchema, `${path}.$defs.${definitionName}`)
        );
      }
      continue;
    }

    if (key === "items") {
      issues.push(...findStrictSchemaIssues(value, `${path}.items`));
      continue;
    }

    if ((key === "anyOf" || key === "oneOf" || key === "allOf") && Array.isArray(value)) {
      value.forEach((item, index) => {
        issues.push(...findStrictSchemaIssues(item, `${path}.${key}[${index}]`));
      });
    }
  }

  return issues;
}

const generatedTrainingDraftV4SchemaIssues = findStrictSchemaIssues(
  generatedTrainingDraftV4Schema,
  "generatedTrainingDraftV4Schema"
);

if (generatedTrainingDraftV4SchemaIssues.length > 0) {
  throw new Error(
    `Invalid v4 structured-output schema:\n${generatedTrainingDraftV4SchemaIssues.join("\n")}`
  );
}

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

function answerId(label: string) {
  return `answer-${label.toLowerCase()}`;
}

function buildLegacySlideConfig(
  slideType: GeneratedSlideType,
  slideObject: Record<string, unknown>,
  body: string
) {
  const configObject = readObject(slideObject.config);

  if (configObject) return configObject;

  const correctAnswer = readString(slideObject.correct_answer).toUpperCase();

  if (slideType === "knowledge_check") {
    return {
      question: readString(slideObject.question_text),
      answers: [
        { id: "answer-a", text: readString(slideObject.answer_a) },
        { id: "answer-b", text: readString(slideObject.answer_b) },
        { id: "answer-c", text: readString(slideObject.answer_c) },
        { id: "answer-d", text: readString(slideObject.answer_d) },
      ].filter((answer) => answer.text),
      correctAnswerId: answerId(correctAnswer || "A"),
      explanation: readString(slideObject.explanation),
      allowRetry: true,
    };
  }

  if (slideType === "scenario") {
    return {
      scenarioText: body,
      question: readString(slideObject.question_text),
      answers: [
        { id: "answer-a", text: readString(slideObject.answer_a) },
        { id: "answer-b", text: readString(slideObject.answer_b) },
        { id: "answer-c", text: readString(slideObject.answer_c) },
        { id: "answer-d", text: readString(slideObject.answer_d) },
      ].filter((answer) => answer.text),
      correctAnswerId: answerId(correctAnswer || "A"),
      explanation: readString(slideObject.explanation),
      allowRetry: true,
    };
  }

  if (slideType === "reflection") {
    return {
      prompt: body,
      placeholder: "Write your response here...",
      responseRequired: false,
    };
  }

  if (slideType === "recap") {
    return {
      items: [body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()].filter(Boolean),
      closingMessage: "",
    };
  }

  if (slideType === "image_hotspot") {
    return {
      imageUrl: "",
      instruction: readString(slideObject.instruction),
      hotspots: [],
      requireAllHotspots: true,
      requiresAdminSetup: true,
      imageSuggestion: readString(slideObject.image_suggestion),
      suggestedHotspots: [],
    };
  }

  if (slideType === "callout") {
    return {
      emphasis: "key_takeaway",
    };
  }

  return {
    layout: "standard",
  };
}

function isGeneratedConfigValid(
  slideType: GeneratedSlideType,
  config: Record<string, unknown>
) {
  if (
    slideType === "image_hotspot" &&
    config.requiresAdminSetup === true &&
    Array.isArray(config.suggestedHotspots)
  ) {
    return true;
  }

  return validateLearningBlockConfig(
    slideType as LearningBlockType,
    config
  ).errors.length === 0;
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
  const category = normalizeCategorySlug(readString(moduleDraft.category));
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
	          const normalizedSlideType = slideType as GeneratedSlideType;
	          const config = slideTypes.has(normalizedSlideType)
	            ? buildLegacySlideConfig(normalizedSlideType, slideObject, body)
	            : {};

	          if (!slideTitle || !slideTypes.has(normalizedSlideType)) {
	            return null;
	          }

	          if (
	            slideType === "knowledge_check" &&
	            !readObject(slideObject.config) &&
	            (!readString(slideObject.question_text) ||
	              !readString(slideObject.answer_a) ||
	              !readString(slideObject.answer_b) ||
	              !correctAnswers.has(correctAnswer))
	          ) {
	            return null;
	          }

	          if (!isGeneratedConfigValid(normalizedSlideType, config)) {
	            return null;
	          }

	          return {
	            slide_order: readInteger(slideObject.slide_order, index + 1),
	            slide_type: normalizedSlideType,
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
	            config: normalizeLearningBlockConfig(
	              normalizedSlideType as LearningBlockType,
	              config,
	              { title: slideTitle, body }
	            ) as Record<string, unknown>,
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
