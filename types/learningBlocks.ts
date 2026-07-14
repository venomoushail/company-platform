export type LearningBlockType =
  | "content"
  | "knowledge_check"
  | "image_hotspot"
  | "scenario"
  | "reflection"
  | "recap"
  | "callout";

export type LearningBlockAnswer = {
  id: string;
  text: string;
};

export type ContentBlockConfig = {
  layout?: "standard" | "text_left" | "text_right" | "image_top";
};

export type KnowledgeCheckConfig = {
  question: string;
  answers: LearningBlockAnswer[];
  correctAnswerId: string;
  explanation: string;
  allowRetry?: boolean;
};

export type ScenarioBlockConfig = {
  scenarioText: string;
  question: string;
  answers: LearningBlockAnswer[];
  correctAnswerId: string;
  explanation: string;
  allowRetry?: boolean;
};

export type ReflectionBlockConfig = {
  prompt: string;
  placeholder?: string;
  responseRequired?: boolean;
};

export type RecapBlockConfig = {
  items: string[];
  closingMessage?: string;
};

export type ImageHotspotConfig = {
  imageUrl: string;
  instruction: string;
  hotspots: {
    id: string;
    xPercent: number;
    yPercent: number;
    radiusPercent?: number;
    title: string;
    description: string;
    isRequired?: boolean;
  }[];
  requireAllHotspots?: boolean;
  requiresAdminSetup?: boolean;
};

export type LearningBlockConfig =
  | ContentBlockConfig
  | KnowledgeCheckConfig
  | ScenarioBlockConfig
  | ReflectionBlockConfig
  | RecapBlockConfig
  | ImageHotspotConfig;

export type LearningBlockInteractionState = {
  selectedAnswerId?: string;
  submittedAnswerId?: string;
  reflectionText?: string;
  openedHotspotIds?: string[];
};

export const learningBlockTypes = [
  "content",
  "knowledge_check",
  "image_hotspot",
  "scenario",
  "reflection",
  "recap",
  "callout",
] as const satisfies LearningBlockType[];

const validLearningBlockTypes = new Set<LearningBlockType>(learningBlockTypes);
const validContentLayouts = new Set([
  "standard",
  "text_left",
  "text_right",
  "image_top",
]);

function readObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readEditableText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function readPercent(value: unknown, fallback: number) {
  const numberValue = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numberValue)) return fallback;

  return Math.min(100, Math.max(0, numberValue));
}

export function isPersistentImageUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return false;

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();

    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      hostname !== "localhost" &&
      hostname !== "127.0.0.1" &&
      hostname !== "[::1]" &&
      !hostname.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

function createStableId(prefix: string, index: number) {
  return `${prefix}-${index + 1}`;
}

function normalizeAnswers(value: unknown, prefix: string) {
  const sourceAnswers = Array.isArray(value) ? value : [];
  const answers = sourceAnswers
    .map((answer, index) => {
      const answerObject = readObject(answer);
      const text = readString(answerObject.text);

      if (!text) return null;

      return {
        id: readString(answerObject.id) || createStableId(prefix, index),
        text,
      };
    })
    .filter((answer): answer is LearningBlockAnswer => Boolean(answer))
    .slice(0, 6);

  while (answers.length < 2) {
    answers.push({
      id: createStableId(prefix, answers.length),
      text: "",
    });
  }

  return answers;
}

export function normalizeLearningBlockType(value: unknown): LearningBlockType {
  const slideType = readString(value) as LearningBlockType;

  return validLearningBlockTypes.has(slideType) ? slideType : "content";
}

export function getDefaultLearningBlockConfig(
  type: LearningBlockType
): LearningBlockConfig {
  if (type === "knowledge_check") {
    return {
      question: "",
      answers: [
        { id: "answer-1", text: "" },
        { id: "answer-2", text: "" },
      ],
      correctAnswerId: "answer-1",
      explanation: "",
      allowRetry: true,
    };
  }

  if (type === "scenario") {
    return {
      scenarioText: "",
      question: "",
      answers: [
        { id: "response-1", text: "" },
        { id: "response-2", text: "" },
      ],
      correctAnswerId: "response-1",
      explanation: "",
      allowRetry: true,
    };
  }

  if (type === "reflection") {
    return {
      prompt: "",
      placeholder: "Write your response here...",
      responseRequired: false,
    };
  }

  if (type === "recap") {
    return {
      items: ["", ""],
      closingMessage: "",
    };
  }

  if (type === "image_hotspot") {
    return {
      imageUrl: "",
      instruction: "Select each marker to learn more.",
      hotspots: [],
      requireAllHotspots: true,
    };
  }

  return {
    layout: "standard",
  };
}

export function normalizeLearningBlockConfig(
  type: LearningBlockType,
  config: unknown,
  legacy?: { title?: string; body?: string; imageUrl?: string | null }
): LearningBlockConfig {
  const configObject = readObject(config);

  if (type === "knowledge_check") {
    const answers = normalizeAnswers(configObject.answers, "answer");
    const correctAnswerId =
      readString(configObject.correctAnswerId) || answers[0]?.id || "answer-1";

    return {
      ...configObject,
      question:
        readString(configObject.question) ||
        readString((legacy?.body ?? "").match(/Knowledge Check:<\/strong>\s*([^<]+)/i)?.[1]),
      answers,
      correctAnswerId: answers.some((answer) => answer.id === correctAnswerId)
        ? correctAnswerId
        : answers[0]?.id ?? "answer-1",
      explanation: readString(configObject.explanation),
      allowRetry: readBoolean(configObject.allowRetry, true),
    };
  }

  if (type === "scenario") {
    const answers = normalizeAnswers(configObject.answers, "response");
    const correctAnswerId =
      readString(configObject.correctAnswerId) || answers[0]?.id || "response-1";

    return {
      ...configObject,
      scenarioText: readString(configObject.scenarioText) || legacy?.body || "",
      question: readString(configObject.question),
      answers,
      correctAnswerId: answers.some((answer) => answer.id === correctAnswerId)
        ? correctAnswerId
        : answers[0]?.id ?? "response-1",
      explanation: readString(configObject.explanation),
      allowRetry: readBoolean(configObject.allowRetry, true),
    };
  }

  if (type === "reflection") {
    return {
      ...configObject,
      prompt: readString(configObject.prompt) || legacy?.body || legacy?.title || "",
      placeholder:
        readString(configObject.placeholder) || "Write your response here...",
      responseRequired: readBoolean(configObject.responseRequired, false),
    };
  }

  if (type === "recap") {
    const items = Array.isArray(configObject.items)
      ? configObject.items.map(readString).filter(Boolean)
      : [];

    return {
      ...configObject,
      items: items.length > 0 ? items : ["Key takeaway"],
      closingMessage: readString(configObject.closingMessage),
    };
  }

  if (type === "image_hotspot") {
    const hotspots: ImageHotspotConfig["hotspots"] = Array.isArray(
      configObject.hotspots
    )
      ? configObject.hotspots.reduce<ImageHotspotConfig["hotspots"]>(
          (normalizedHotspots, hotspot, index) => {
            const hotspotObject = readObject(hotspot);
            const id = readString(hotspotObject.id);
            const title = readEditableText(hotspotObject.title);
            const description = readEditableText(hotspotObject.description);
            const hasPosition =
              hotspotObject.xPercent !== undefined ||
              hotspotObject.yPercent !== undefined;

            if (!id && !hasPosition && !title.trim() && !description.trim()) {
              return normalizedHotspots;
            }

            normalizedHotspots.push({
              id: id || createStableId("hotspot", index),
              xPercent: readPercent(hotspotObject.xPercent, 50),
              yPercent: readPercent(hotspotObject.yPercent, 50),
              radiusPercent:
                hotspotObject.radiusPercent === undefined
                  ? undefined
                  : readPercent(hotspotObject.radiusPercent, 4),
              title,
              description,
              isRequired: readBoolean(hotspotObject.isRequired, true),
            });

            return normalizedHotspots;
          },
          []
        )
      : [];

    return {
      ...configObject,
      imageUrl: readString(configObject.imageUrl) || legacy?.imageUrl || "",
      instruction: readEditableText(configObject.instruction).trim()
        ? readEditableText(configObject.instruction)
        : "Select each marker to learn more.",
      hotspots,
      requireAllHotspots: readBoolean(configObject.requireAllHotspots, true),
      requiresAdminSetup: readBoolean(configObject.requiresAdminSetup, false),
    };
  }

  const layout = readString(configObject.layout) as ContentBlockConfig["layout"];

  return {
    ...configObject,
    layout: layout && validContentLayouts.has(layout) ? layout : "standard",
  };
}

export function validateLearningBlockConfig(
  type: LearningBlockType,
  config: unknown
) {
  const normalizedConfig = normalizeLearningBlockConfig(type, config);
  const errors: string[] = [];

  if (type === "knowledge_check" || type === "scenario") {
    const configWithAnswers = normalizedConfig as
      | KnowledgeCheckConfig
      | ScenarioBlockConfig;
    const completeAnswers = configWithAnswers.answers.filter((answer) =>
      answer.text.trim()
    );

    if (
      type === "knowledge_check" &&
      !(normalizedConfig as KnowledgeCheckConfig).question.trim()
    ) {
      errors.push("Question is required.");
    }

    if (type === "scenario") {
      const scenarioConfig = normalizedConfig as ScenarioBlockConfig;
      if (!scenarioConfig.scenarioText.trim()) errors.push("Scenario is required.");
      if (!scenarioConfig.question.trim()) errors.push("Decision question is required.");
    }

    if (completeAnswers.length < 2) errors.push("Add at least two answer choices.");
    if (!completeAnswers.some((answer) => answer.id === configWithAnswers.correctAnswerId)) {
      errors.push("Choose one correct answer.");
    }
    if (!configWithAnswers.explanation.trim()) errors.push("Explanation is required.");
  }

  if (type === "reflection") {
    const reflectionConfig = normalizedConfig as ReflectionBlockConfig;
    if (!reflectionConfig.prompt.trim()) errors.push("Reflection prompt is required.");
  }

  if (type === "recap") {
    const recapConfig = normalizedConfig as RecapBlockConfig;
    if (recapConfig.items.filter((item) => item.trim()).length === 0) {
      errors.push("Add at least one recap item.");
    }
  }

  if (type === "image_hotspot") {
    const hotspotConfig = normalizedConfig as ImageHotspotConfig;
    if (
      hotspotConfig.requiresAdminSetup ||
      !isPersistentImageUrl(hotspotConfig.imageUrl)
    ) {
      errors.push("Upload a permanent image before publishing.");
    }
    if (hotspotConfig.hotspots.length === 0) {
      errors.push("Add at least one hotspot.");
    }

    hotspotConfig.hotspots.forEach((hotspot, index) => {
      if (hotspot.xPercent < 0 || hotspot.xPercent > 100) {
        errors.push(`Hotspot ${index + 1} horizontal position must be 0-100.`);
      }
      if (hotspot.yPercent < 0 || hotspot.yPercent > 100) {
        errors.push(`Hotspot ${index + 1} vertical position must be 0-100.`);
      }
      if (!hotspot.title.trim()) errors.push(`Hotspot ${index + 1} title is required.`);
      if (!hotspot.description.trim()) {
        errors.push(`Hotspot ${index + 1} description is required.`);
      }
    });
  }

  return {
    config: normalizedConfig,
    errors,
  };
}

export function regenerateLearningBlockConfigIds(
  type: LearningBlockType,
  config: unknown
) {
  const normalizedConfig = normalizeLearningBlockConfig(type, config);
  const suffix = Date.now().toString(36);

  if (type === "knowledge_check" || type === "scenario") {
    const configWithAnswers = normalizedConfig as
      | KnowledgeCheckConfig
      | ScenarioBlockConfig;
    const idMap = new Map<string, string>();
    const answers = configWithAnswers.answers.map((answer, index) => {
      const nextId = `${type}-answer-${suffix}-${index + 1}`;
      idMap.set(answer.id, nextId);
      return { ...answer, id: nextId };
    });

    return {
      ...configWithAnswers,
      answers,
      correctAnswerId:
        idMap.get(configWithAnswers.correctAnswerId) || answers[0]?.id || "",
    };
  }

  if (type === "image_hotspot") {
    const hotspotConfig = normalizedConfig as ImageHotspotConfig;

    return {
      ...hotspotConfig,
      hotspots: hotspotConfig.hotspots.map((hotspot, index) => ({
        ...hotspot,
        id: `hotspot-${suffix}-${index + 1}`,
      })),
    };
  }

  return normalizedConfig;
}

export function isLearningBlockComplete(
  type: LearningBlockType,
  config: LearningBlockConfig,
  state: LearningBlockInteractionState = {}
) {
  if (type === "knowledge_check" || type === "scenario") {
    const answersConfig = config as KnowledgeCheckConfig | ScenarioBlockConfig;
    if (!state.submittedAnswerId) return false;

    return (
      state.submittedAnswerId === answersConfig.correctAnswerId ||
      answersConfig.allowRetry === false
    );
  }

  if (type === "reflection") {
    const reflectionConfig = config as ReflectionBlockConfig;

    return !reflectionConfig.responseRequired || Boolean(state.reflectionText?.trim());
  }

  if (type === "image_hotspot") {
    const hotspotConfig = config as ImageHotspotConfig;
    if (!hotspotConfig.requireAllHotspots) return true;

    const openedHotspotIds = new Set(state.openedHotspotIds ?? []);
    const requiredHotspots = hotspotConfig.hotspots.filter(
      (hotspot) => hotspot.isRequired !== false
    );

    return requiredHotspots.every((hotspot) => openedHotspotIds.has(hotspot.id));
  }

  return true;
}
