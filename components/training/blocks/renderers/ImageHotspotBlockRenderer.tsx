"use client";

import type {
  ImageHotspotConfig,
  LearningBlockInteractionState,
} from "@/types/learningBlocks";
import { isPersistentImageUrl } from "@/types/learningBlocks";
import Image from "next/image";
import { useState } from "react";

type Props = {
  title: string;
  imageAlt?: string;
  isAdminPreview?: boolean;
  config: ImageHotspotConfig;
  state: LearningBlockInteractionState;
  onStateChange: (state: LearningBlockInteractionState) => void;
};

export default function ImageHotspotBlockRenderer({
  title,
  imageAlt,
  isAdminPreview,
  config,
  state,
  onStateChange,
}: Props) {
  const [activeHotspotId, setActiveHotspotId] = useState("");
  const [imageAspectRatio, setImageAspectRatio] = useState(16 / 9);
  const [failedImageUrl, setFailedImageUrl] = useState("");
  const imageUnavailable =
    !isPersistentImageUrl(config.imageUrl) || failedImageUrl === config.imageUrl;
  const openedHotspotIds = new Set(state.openedHotspotIds ?? []);
  const activeHotspot = config.hotspots.find(
    (hotspot) => hotspot.id === activeHotspotId
  );
  const activeHotspotIndex = config.hotspots.findIndex(
    (hotspot) => hotspot.id === activeHotspotId
  );

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

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div
          className="relative mx-auto w-full max-w-5xl overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-sm"
          style={{ aspectRatio: imageAspectRatio }}
        >
          {!imageUnavailable ? (
            <Image
              src={config.imageUrl}
              alt={imageAlt || title || "Interactive hotspot image"}
              fill
              sizes="(max-width: 1280px) 100vw, 900px"
              unoptimized
              onError={() => setFailedImageUrl(config.imageUrl)}
              onLoad={(event) => {
                const image = event.currentTarget;
                if (image.naturalWidth && image.naturalHeight) {
                  setImageAspectRatio(image.naturalWidth / image.naturalHeight);
                }
              }}
              className="object-contain"
            />
          ) : (
            <div className="flex h-full min-h-64 items-center justify-center px-6 text-center">
              <div>
                <p className="text-sm font-bold text-slate-700">
                  This hotspot image has not been configured.
                </p>
                {isAdminPreview && (
                  <p className="mt-2 text-sm text-slate-500">
                    Return to the editor to upload the image.
                  </p>
                )}
              </div>
            </div>
          )}

          {!imageUnavailable && config.hotspots.map((hotspot, index) => {
            const isOpened = openedHotspotIds.has(hotspot.id);

            return (
              <button
                key={hotspot.id}
                type="button"
                onClick={() => openHotspot(hotspot.id)}
                className={`absolute flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 text-sm font-bold shadow-[0_2px_8px_rgba(15,23,42,0.65)] transition hover:scale-110 focus:outline-none focus:ring-4 focus:ring-blue-300 ${
                  isOpened
                    ? "border-green-700 bg-green-600 text-white"
                    : "border-white bg-orange-600 text-white"
                } ${activeHotspotId === hotspot.id ? "scale-110 ring-4 ring-blue-400" : ""}`}
                style={{
                  left: `${hotspot.xPercent}%`,
                  top: `${hotspot.yPercent}%`,
                }}
                aria-label={`Hotspot ${index + 1}: ${
                  hotspot.title || "Untitled hotspot"
                }${hotspot.isRequired !== false ? ", required" : ""}`}
              >
                {index + 1}
                {hotspot.isRequired !== false && (
                  <span
                    aria-hidden="true"
                    className="absolute -right-1.5 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full border border-white bg-slate-900 px-1 text-[10px] leading-none text-white"
                  >
                    *
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm xl:sticky xl:top-4">
          {activeHotspot ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Hotspot {activeHotspotIndex + 1}
                </p>
                <span className="inline-flex items-center gap-1 text-xs font-bold text-green-700">
                  <span aria-hidden="true">✓</span> Viewed
                </span>
              </div>
              <h2 className="mt-1 font-bold text-slate-900">
                {activeHotspot.title || "Untitled hotspot"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {activeHotspot.description || "Add a hotspot description."}
              </p>
            </>
          ) : (
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-bold text-orange-700"
              >
                1
              </span>
              <div>
                <p className="text-sm font-bold text-slate-800">Choose a marker</p>
                <p className="mt-1 text-sm leading-5 text-slate-500">
                  Select a numbered marker on the image to learn more.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
