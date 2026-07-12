import { buildRestaurantTrainingInputV1 } from "./v1";
import { buildRestaurantTrainingInputV2 } from "./v2";
import { buildRestaurantTrainingInputV3 } from "./v3";
import { buildRestaurantTrainingInputV4 } from "./v4";

export type GenerationStyle =
  | "standard"
  | "beginner_friendly"
  | "detailed"
  | "executive_summary";

export type PromptVersion = "v1" | "v2" | "v3" | "v4";

export type RestaurantTrainingPromptMessage = {
  role: "system" | "user";
  content: string;
};

export type RestaurantTrainingPromptBuilder = (
  extractedText: string,
  generationStyle: GenerationStyle
) => RestaurantTrainingPromptMessage[];

export const generationStyles = new Set<GenerationStyle>([
  "standard",
  "beginner_friendly",
  "detailed",
  "executive_summary",
]);

export const availablePromptVersions = ["v1", "v2", "v3", "v4"] as const;
export const defaultPromptVersion: PromptVersion = "v4";

const promptBuilders: Record<PromptVersion, RestaurantTrainingPromptBuilder> = {
  v1: buildRestaurantTrainingInputV1,
  v2: buildRestaurantTrainingInputV2,
  v3: buildRestaurantTrainingInputV3,
  v4: buildRestaurantTrainingInputV4,
};

export function isGenerationStyle(value: unknown): value is GenerationStyle {
  return typeof value === "string" && generationStyles.has(value as GenerationStyle);
}

export function isPromptVersion(value: unknown): value is PromptVersion {
  return (
    typeof value === "string" &&
    availablePromptVersions.includes(value as PromptVersion)
  );
}

export function getRestaurantTrainingPromptBuilder(
  version: unknown
): RestaurantTrainingPromptBuilder {
  return isPromptVersion(version)
    ? promptBuilders[version]
    : promptBuilders[defaultPromptVersion];
}

export function getRestaurantTrainingPromptVersion(version: unknown): PromptVersion {
  return isPromptVersion(version) ? version : defaultPromptVersion;
}
