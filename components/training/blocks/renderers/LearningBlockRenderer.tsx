"use client";

import ContentBlockRenderer from "@/components/training/blocks/renderers/ContentBlockRenderer";
import ImageHotspotBlockRenderer from "@/components/training/blocks/renderers/ImageHotspotBlockRenderer";
import KnowledgeCheckBlockRenderer from "@/components/training/blocks/renderers/KnowledgeCheckBlockRenderer";
import RecapBlockRenderer from "@/components/training/blocks/renderers/RecapBlockRenderer";
import ReflectionBlockRenderer from "@/components/training/blocks/renderers/ReflectionBlockRenderer";
import ScenarioBlockRenderer from "@/components/training/blocks/renderers/ScenarioBlockRenderer";
import type {
  ContentBlockConfig,
  ImageHotspotConfig,
  KnowledgeCheckConfig,
  LearningBlockConfig,
  LearningBlockInteractionState,
  LearningBlockType,
  RecapBlockConfig,
  ReflectionBlockConfig,
  ScenarioBlockConfig,
} from "@/types/learningBlocks";
import {
  normalizeLearningBlockConfig,
  normalizeLearningBlockType,
} from "@/types/learningBlocks";
import { useState } from "react";

export type LearningBlockRenderData = {
  id: number;
  title: string;
  body: string;
  slide_type?: string;
  config_json?: unknown;
  media?: {
    type: "image";
    url: string;
    alt?: string;
  };
};

type Props = {
  block: LearningBlockRenderData;
  state?: LearningBlockInteractionState;
  onStateChange?: (state: LearningBlockInteractionState) => void;
  titleClassName?: string;
  imageClassName?: string;
  imageSizes?: string;
  contentClassName?: string;
  emptyContentClassName?: string;
  headingClassName?: string;
  isAdminPreview?: boolean;
};

export function getRenderableLearningBlock(block: LearningBlockRenderData) {
  const type = normalizeLearningBlockType(block.slide_type);
  const config = normalizeLearningBlockConfig(type, block.config_json, {
    title: block.title,
    body: block.body,
    imageUrl: block.media?.url,
  });

  return { type, config };
}

export default function LearningBlockRenderer({
  block,
  state,
  onStateChange,
  titleClassName,
  imageClassName,
  imageSizes,
  contentClassName,
  emptyContentClassName,
  headingClassName,
  isAdminPreview,
}: Props) {
  const [internalState, setInternalState] =
    useState<LearningBlockInteractionState>({});
  const effectiveState = state ?? internalState;
  const setEffectiveState = onStateChange ?? setInternalState;
  const { type, config } = getRenderableLearningBlock(block);
  const sharedContentProps = {
    title: block.title,
    body: block.body,
    imageUrl: block.media?.url,
    imageAlt: block.media?.alt,
    titleClassName,
    imageClassName,
    imageSizes,
    contentClassName,
    emptyContentClassName,
    headingClassName,
  };

  if (type === "knowledge_check") {
    return (
      <KnowledgeCheckBlockRenderer
        title={block.title}
        config={config as KnowledgeCheckConfig}
        state={effectiveState}
        onStateChange={setEffectiveState}
      />
    );
  }

  if (type === "scenario") {
    return (
      <ScenarioBlockRenderer
        title={block.title}
        body={block.body}
        config={config as ScenarioBlockConfig}
        state={effectiveState}
        onStateChange={setEffectiveState}
      />
    );
  }

  if (type === "reflection") {
    return (
      <ReflectionBlockRenderer
        title={block.title}
        body={block.body}
        config={config as ReflectionBlockConfig}
        state={effectiveState}
        onStateChange={setEffectiveState}
      />
    );
  }

  if (type === "recap") {
    return <RecapBlockRenderer title={block.title} config={config as RecapBlockConfig} />;
  }

  if (type === "image_hotspot") {
    return (
      <ImageHotspotBlockRenderer
        title={block.title}
        imageAlt={block.media?.alt}
        isAdminPreview={isAdminPreview}
        config={config as ImageHotspotConfig}
        state={effectiveState}
        onStateChange={setEffectiveState}
      />
    );
  }

  return (
    <ContentBlockRenderer
      {...sharedContentProps}
      config={config as ContentBlockConfig}
    />
  );
}

export type NormalizedLearningBlock = {
  type: LearningBlockType;
  config: LearningBlockConfig;
};
