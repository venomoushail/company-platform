import { QuizQuestion } from "@/components/training/QuizBuilder";

type QuizViewerProps = {
  question: QuizQuestion;
};

export default function QuizViewer({ question }: QuizViewerProps) {
  return (
    <div className="rounded-xl bg-white p-8 shadow-sm">
      <div className="mb-6">
        <p className="text-sm font-semibold text-blue-600">Quiz</p>

        <h2 className="mt-2 text-2xl font-bold text-slate-900">
          {question.question || "Question text will appear here."}
        </h2>
      </div>

      <div className="space-y-3">
        {question.answers.map((answer, index) => (
          <div
            key={index}
            className={`rounded-lg border px-4 py-3 text-sm ${
              index === question.correctAnswerIndex
                ? "border-green-300 bg-green-50 text-green-800"
                : "border-slate-200 bg-white text-slate-700"
            }`}
          >
            <span className="font-semibold">
              {String.fromCharCode(65 + index)}.
            </span>{" "}
            {answer || `Answer ${String.fromCharCode(65 + index)}`}
          </div>
        ))}
      </div>
    </div>
  );
}