"use client";

import type {
  ImageHotspotConfig,
  LearningBlockInteractionState,
} from "@/types/learningBlocks";
import Image from "next/image";
import { useState } from "react";

type Props = {
  title: string;
  config: ImageHotspotConfig;
  state: LearningBlockInteractionState;
  onStateChange: (state: LearningBlockInteractionState) => void;
};

export default function ImageHotspotBlockRenderer({
  title,
  config,
  state,
  onStateChange,
}: Props) {
  const [activeHotspotId, setActiveHotspotId] = useState(
    config.hotspots[0]?.id ?? ""
  );
  const openedHotspotIds = new Set(state.openedHotspotIds ?? []);
  const activeHotspot =
    config.hotspots.find((hotspot) => hotspot.id === activeHotspotId) ??
    config.hotspots[0];

  function openHotspot(hotspotId: string) {
    const nextOpened = new Set(openedHotspotIds);
    nextOpened.add(hotspotId);
    setActiveHotspotId(hotspotId);
    onStateChange({
      ...state,
      openedHotspotIds: Array.from(nextOpened),
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-bold uppercase tracking-wide text-orange-700">
          Image Hotspot
        </p>
        <h1 className="mt-1 text-3xl font-bold leading-tight text-slate-900">
          {title || "Image Hotspot"}
        </h1>
      </div>

      <p className="text-sm font-semibold text-slate-700">
        {config.instruction || "Select each marker to learn more."}
      </p>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="relative min-h-72 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          {config.imageUrl ? (
            <Image
              src={config.imageUrl}
              alt={title || "Interactive hotspot image"}
              fill
              sizes="(max-width: 1024px) 100vw, 720px"
              unoptimized
              className="object-contain"
            />
          ) : (
            <div className="flex min-h-72 items-center justify-center text-sm font-semibold text-slate-500">
              Add an image to configure hotspots.
            </div>
          )}

          {config.hotspots.map((hotspot, index) => {
            const isOpened = openedHotspotIds.has(hotspot.id);

            return (
              <button
                key={hotspot.id}
                type="button"
                onClick={() => openHotspot(hotspot.id)}
                className={`absolute flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 text-sm font-bold shadow-lg transition focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                  isOpened
                    ? "border-green-700 bg-green-600 text-white"
                    : "border-white bg-orange-600 text-white"
                }`}
                style={{
                  left: `${hotspot.xPercent}%`,
                  top: `${hotspot.yPercent}%`,
                }}
                aria-label={`Open hotspot ${index + 1}: ${hotspot.title}`}
              >
                {index + 1}
              </button>
            );
          })}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          {activeHotspot ? (
            <>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                Hotspot
              </p>
              <h2 className="mt-1 font-bold text-slate-900">
                {activeHotspot.title || "Untitled hotspot"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {activeHotspot.description || "Add a hotspot description."}
              </p>
            </>
          ) : (
            <p className="text-sm font-semibold text-slate-500">
              Select a marker to learn more.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
