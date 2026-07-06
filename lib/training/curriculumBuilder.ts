export type RecommendedTrainingModule = {
  module_order: number;
  title: string;
  description: string;
  category: string;
  estimated_minutes: number;
  recommended_audience: string;
  why_this_should_be_separate: string;
  source_topic_summary: string;
  suggested_slide_count: number;
  suggested_quiz_question_count: number;
};

export type GeneratedCurriculum = {
  curriculum_title: string;
  description: string;
  recommended_modules: RecommendedTrainingModule[];
};

export type GeneratedCurriculumRecord = {
  mode: "curriculum_builder";
  prompt_family: "curriculumBuilder";
  prompt_version: string;
  generation_style: string;
  model: string;
  generated_at: string;
  curriculum: GeneratedCurriculum;
  created_module_ids?: string[];
};

export const generatedCurriculumSchema = {
  type: "object",
  additionalProperties: false,
  required: ["curriculum_title", "description", "recommended_modules"],
  properties: {
    curriculum_title: { type: "string" },
    description: { type: "string" },
    recommended_modules: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "module_order",
          "title",
          "description",
          "category",
          "estimated_minutes",
          "recommended_audience",
          "why_this_should_be_separate",
          "source_topic_summary",
          "suggested_slide_count",
          "suggested_quiz_question_count",
        ],
        properties: {
          module_order: { type: "integer", minimum: 1 },
          title: { type: "string" },
          description: { type: "string" },
          category: { type: "string" },
          estimated_minutes: { type: "integer", minimum: 1 },
          recommended_audience: { type: "string" },
          why_this_should_be_separate: { type: "string" },
          source_topic_summary: { type: "string" },
          suggested_slide_count: { type: "integer", minimum: 1 },
          suggested_quiz_question_count: { type: "integer", minimum: 1 },
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

function getCurriculumPayload(value: unknown) {
  const root = readObject(value);
  if (!root) return null;

  return readObject(root.curriculum) ?? root;
}

export function normalizeGeneratedCurriculum(value: unknown): GeneratedCurriculum | null {
  const root = getCurriculumPayload(value);
  if (!root) return null;

  const curriculumTitle = readString(root.curriculum_title);
  const description = readString(root.description);
  const modules = Array.isArray(root.recommended_modules)
    ? root.recommended_modules
        .map((module, index) => {
          const moduleObject = readObject(module);
          if (!moduleObject) return null;

          const title = readString(moduleObject.title);
          const moduleDescription = readString(moduleObject.description);

          if (!title || !moduleDescription) return null;

          return {
            module_order: readInteger(moduleObject.module_order, index + 1),
            title,
            description: moduleDescription,
            category: readString(moduleObject.category) || "General",
            estimated_minutes: Math.max(
              1,
              readInteger(moduleObject.estimated_minutes, 10)
            ),
            recommended_audience:
              readString(moduleObject.recommended_audience) || "all",
            why_this_should_be_separate: readString(
              moduleObject.why_this_should_be_separate
            ),
            source_topic_summary: readString(moduleObject.source_topic_summary),
            suggested_slide_count: Math.max(
              1,
              readInteger(moduleObject.suggested_slide_count, 8)
            ),
            suggested_quiz_question_count: Math.max(
              1,
              readInteger(moduleObject.suggested_quiz_question_count, 5)
            ),
          };
        })
        .filter((module): module is RecommendedTrainingModule => Boolean(module))
    : [];

  if (!curriculumTitle || modules.length === 0) return null;

  return {
    curriculum_title: curriculumTitle,
    description,
    recommended_modules: modules
      .sort((first, second) => first.module_order - second.module_order)
      .map((module, index) => ({
        ...module,
        module_order: index + 1,
      })),
  };
}

export function getGeneratedCurriculumRecord(
  value: unknown
): GeneratedCurriculumRecord | null {
  const root = readObject(value);
  if (!root || root.mode !== "curriculum_builder") return null;

  const curriculum = normalizeGeneratedCurriculum(root.curriculum);
  if (!curriculum) return null;

  const createdModuleIds = Array.isArray(root.created_module_ids)
    ? root.created_module_ids.map(readString).filter(Boolean)
    : undefined;

  return {
    mode: "curriculum_builder",
    prompt_family: "curriculumBuilder",
    prompt_version: readString(root.prompt_version),
    generation_style: readString(root.generation_style),
    model: readString(root.model),
    generated_at: readString(root.generated_at),
    curriculum,
    created_module_ids: createdModuleIds,
  };
}
