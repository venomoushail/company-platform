"use client";

import type {
  LearningBlockInteractionState,
  ReflectionBlockConfig,
} from "@/types/learningBlocks";

type Props = {
  title: string;
  config: ReflectionBlockConfig;
  state: LearningBlockInteractionState;
  onStateChange: (state: LearningBlockInteractionState) => void;
};

export default function ReflectionBlockRenderer({
  title,
  config,
  state,
  onStateChange,
}: Props) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-bold uppercase tracking-wide text-teal-700">
          Reflection
        </p>
        <h1 className="mt-1 text-3xl font-bold leading-tight text-slate-900">
          {title || "Reflection"}
        </h1>
      </div>

      <div className="rounded-xl border border-teal-200 bg-teal-50 p-5">
        <p className="text-lg font-semibold leading-7 text-slate-900">
          {config.prompt || "Add a reflection prompt."}
        </p>
      </div>

      <label className="block">
        <span className="text-sm font-semibold text-slate-700">
          Your reflection{config.responseRequired ? "" : " (optional)"}
        </span>
        <textarea
          value={state.reflectionText ?? ""}
          onChange={(event) =>
            onStateChange({ ...state, reflectionText: event.target.value })
          }
          placeholder={config.placeholder || "Write your response here..."}
          className="mt-2 min-h-36 w-full rounded-lg border border-slate-300 px-4 py-3 text-sm leading-6 text-slate-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
        />
      </label>

      <p className="text-xs leading-5 text-slate-500">
        Reflection responses stay in this lesson session for now.
      </p>
      {/* TODO: Persist employee reflection responses when a scoped storage table exists. */}
    </div>
  );
}
