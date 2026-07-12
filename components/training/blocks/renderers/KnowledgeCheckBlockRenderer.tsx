"use client";

import type {
  KnowledgeCheckConfig,
  LearningBlockInteractionState,
} from "@/types/learningBlocks";

type Props = {
  title: string;
  config: KnowledgeCheckConfig;
  state: LearningBlockInteractionState;
  onStateChange: (state: LearningBlockInteractionState) => void;
};

export default function KnowledgeCheckBlockRenderer({
  title,
  config,
  state,
  onStateChange,
}: Props) {
  const selectedAnswerId = state.selectedAnswerId ?? "";
  const submittedAnswerId = state.submittedAnswerId;
  const isSubmitted = Boolean(submittedAnswerId);
  const isCorrect = submittedAnswerId === config.correctAnswerId;
  const canRetry = isSubmitted && !isCorrect && config.allowRetry !== false;
  const correctAnswer = config.answers.find(
    (answer) => answer.id === config.correctAnswerId
  );

  function submitAnswer() {
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
        <p className="text-sm font-bold uppercase tracking-wide text-blue-600">
          Knowledge Check
        </p>
        <h1 className="mt-1 text-3xl font-bold leading-tight text-slate-900">
          {title || "Knowledge Check"}
        </h1>
      </div>

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
        <p className="text-lg font-semibold text-slate-900">
          {config.question || "Add a question for this knowledge check."}
        </p>
      </div>

      <div className="space-y-3" role="radiogroup" aria-label="Answer choices">
        {config.answers.map((answer) => {
          const isSelected = selectedAnswerId === answer.id;
          const isCorrectAnswer = answer.id === config.correctAnswerId;
          const revealCorrect = isSubmitted && (!config.allowRetry || isCorrect);

          return (
            <button
              key={answer.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={isSubmitted && !canRetry}
              onClick={() =>
                onStateChange({ ...state, selectedAnswerId: answer.id })
              }
              className={`w-full rounded-lg border px-4 py-3 text-left text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                isSelected
                  ? "border-blue-500 bg-white text-blue-700"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              } ${
                revealCorrect && isCorrectAnswer
                  ? "border-green-500 bg-green-50 text-green-800"
                  : ""
              }`}
            >
              {answer.text || "Untitled answer"}
            </button>
          );
        })}
      </div>

      {!isSubmitted && (
        <button
          type="button"
          onClick={submitAnswer}
          disabled={!selectedAnswerId}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Submit answer
        </button>
      )}

      {isSubmitted && (
        <div
          className={`rounded-xl border p-4 ${
            isCorrect
              ? "border-green-200 bg-green-50 text-green-900"
              : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          <p className="font-bold">{isCorrect ? "Correct" : "Not quite"}</p>
          {!isCorrect && correctAnswer && (
            <p className="mt-1 text-sm">
              Correct answer: <span className="font-semibold">{correctAnswer.text}</span>
            </p>
          )}
          {config.explanation && (
            <p className="mt-2 text-sm leading-6">{config.explanation}</p>
          )}
          {canRetry && (
            <button
              type="button"
              onClick={retry}
              className="mt-3 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-semibold text-amber-800 hover:bg-amber-50"
            >
              Try again
            </button>
          )}
        </div>
      )}
    </div>
  );
}
