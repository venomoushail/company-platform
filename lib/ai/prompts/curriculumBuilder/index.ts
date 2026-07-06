import type { GenerationStyle } from "@/lib/ai/prompts/restaurantTraining";
import {
  buildCurriculumBuilderInputV1,
  type CurriculumBuilderPromptMessage,
} from "./v1";

export type CurriculumBuilderPromptVersion = "v1";
export type CurriculumBuilderPromptBuilder = (
  extractedText: string,
  generationStyle: GenerationStyle
) => CurriculumBuilderPromptMessage[];

export const curriculumBuilderPromptFamily = "curriculumBuilder";
export const defaultCurriculumBuilderPromptVersion: CurriculumBuilderPromptVersion = "v1";
export const availableCurriculumBuilderPromptVersions = ["v1"] as const;

const promptBuilders: Record<
  CurriculumBuilderPromptVersion,
  CurriculumBuilderPromptBuilder
> = {
  v1: buildCurriculumBuilderInputV1,
};

export function isCurriculumBuilderPromptVersion(
  value: unknown
): value is CurriculumBuilderPromptVersion {
  return (
    typeof value === "string" &&
    availableCurriculumBuilderPromptVersions.includes(
      value as CurriculumBuilderPromptVersion
    )
  );
}

export function getCurriculumBuilderPromptVersion(
  version: unknown
): CurriculumBuilderPromptVersion {
  return isCurriculumBuilderPromptVersion(version)
    ? version
    : defaultCurriculumBuilderPromptVersion;
}

export function getCurriculumBuilderPromptBuilder(
  version: unknown
): CurriculumBuilderPromptBuilder {
  return promptBuilders[getCurriculumBuilderPromptVersion(version)];
}
