"use client";

import type {
  LearningBlockInteractionState,
  ScenarioBlockConfig,
} from "@/types/learningBlocks";

type Props = {
  title: string;
  config: ScenarioBlockConfig;
  state: LearningBlockInteractionState;
  onStateChange: (state: LearningBlockInteractionState) => void;
};

export default function ScenarioBlockRenderer({
  title,
  config,
  state,
  onStateChange,
}: Props) {
  const selectedAnswerId = state.selectedAnswerId ?? "";
  const submittedAnswerId = state.submittedAnswerId;
  const isSubmitted = Boolean(submittedAnswerId);
  const isBestResponse = submittedAnswerId === config.correctAnswerId;
  const canRetry = isSubmitted && !isBestResponse && config.allowRetry !== false;
  const bestResponse = config.answers.find(
    (answer) => answer.id === config.correctAnswerId
  );

  function submitResponse() {
    if (!selectedAnswerId) return;
    onStateChange({ ...state, submittedAnswerId: selectedAnswerId });
  }

  function retry() {
    onStateChange({
      ...state,
      selectedAnswerId: "",
      submittedAnswerId: undefined,
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-bold uppercase tracking-wide text-violet-700">
          Scenario
        </p>
        <h1 className="mt-1 text-3xl font-bold leading-tight text-slate-900">
          {title || "Scenario"}
        </h1>
      </div>

      <div className="rounded-xl border border-violet-200 bg-violet-50 p-5">
        <p className="text-base leading-7 text-slate-800">
          {config.scenarioText || "Describe the workplace situation."}
        </p>
      </div>

      <p className="text-lg font-semibold text-slate-900">
        {config.question || "What should the employee do next?"}
      </p>

      <div className="grid gap-3">
        {config.answers.map((answer) => (
          <button
            key={answer.id}
            type="button"
            disabled={isSubmitted && !canRetry}
            onClick={() => onStateChange({ ...state, selectedAnswerId: answer.id })}
            className={`rounded-lg border px-4 py-3 text-left text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-violet-500 ${
              selectedAnswerId === answer.id
                ? "border-violet-500 bg-white text-violet-800"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {answer.text || "Untitled response"}
          </button>
        ))}
      </div>

      {!isSubmitted && (
        <button
          type="button"
          onClick={submitResponse}
          disabled={!selectedAnswerId}
          className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Submit response
        </button>
      )}

      {isSubmitted && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="font-bold text-slate-900">
            {isBestResponse ? "Best response" : "Feedback"}
          </p>
          {!isBestResponse && bestResponse && (
            <p className="mt-1 text-sm text-slate-700">
              Best response: <span className="font-semibold">{bestResponse.text}</span>
            </p>
          )}
          {config.explanation && (
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {config.explanation}
            </p>
          )}
          {canRetry && (
            <button
              type="button"
              onClick={retry}
              className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Try another response
            </button>
          )}
        </div>
      )}
    </div>
  );
}
