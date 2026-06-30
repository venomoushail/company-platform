"use client";

import { Dispatch, SetStateAction, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export type QuizQuestion = {
  id: number;
  question: string;
  answers: string[];
  correctAnswerIndex: number;
  isComplete: boolean;
  questionType?: string;
  points?: number;
  explanation?: string | null;
};

type QuizBuilderProps = {
  questions: QuizQuestion[];
  setQuestions: Dispatch<SetStateAction<QuizQuestion[]>>;
  selectedQuestionId: number;
  setSelectedQuestionId: (id: number) => void;
  onFocusBuilder?: () => void;
};

type SortableQuestionButtonProps = {
  question: QuizQuestion;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
};

function SortableQuestionButton({
  question,
  index,
  isSelected,
  onSelect,
}: SortableQuestionButtonProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: question.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const answeredCount = question.answers.filter(
    (answer) => answer.trim().length > 0
  ).length;

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? "opacity-60" : ""}>
      <div
        className={`w-full rounded-lg border px-3 py-3 text-left text-sm transition ${
          isSelected
            ? "border-blue-600 bg-blue-50 text-blue-700"
            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        }`}
      >
        <div className="flex items-start gap-3">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className={`mt-0.5 flex h-7 w-7 shrink-0 cursor-grab items-center justify-center rounded-full text-xs font-bold active:cursor-grabbing ${
              isSelected
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-500"
            }`}
            title="Drag to reorder"
            aria-label="Drag to reorder question"
          >
            ☰
          </button>

          <div
            role="button"
            tabIndex={0}
            onClick={onSelect}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                onSelect();
              }
            }}
            className="min-w-0 flex-1 cursor-pointer rounded-md"
          >
            <p className="truncate font-semibold">
              {index + 1}. {question.question || "Untitled Question"}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              {answeredCount} of {question.answers.length} answers filled
            </p>

            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-xs text-slate-400">
                Correct: Answer{" "}
                {String.fromCharCode(65 + question.correctAnswerIndex)}
              </p>

              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  question.isComplete
                    ? "bg-green-100 text-green-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {question.isComplete ? "Ready" : "Incomplete"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function QuizBuilder({
  questions,
  setQuestions,
  selectedQuestionId,
  setSelectedQuestionId,
  onFocusBuilder,
}: QuizBuilderProps) {
  const [isOutlineCollapsed, setIsOutlineCollapsed] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    })
  );

  const selectedQuestion =
    questions.find((question) => question.id === selectedQuestionId) ??
    questions[0];

  const selectedQuestionIndex = questions.findIndex(
    (question) => question.id === selectedQuestion.id
  );

  function addQuestion() {
    const newQuestion: QuizQuestion = {
      id: Date.now(),
      question: "",
      answers: ["", "", "", ""],
      correctAnswerIndex: 0,
      isComplete: false,
    };

    setQuestions([...questions, newQuestion]);
    setSelectedQuestionId(newQuestion.id);
  }

  function updateQuestionText(id: number, value: string) {
    setQuestions(
      questions.map((question) =>
        question.id === id ? { ...question, question: value } : question
      )
    );
  }

  function toggleQuestionComplete(id: number) {
    setQuestions(
      questions.map((question) =>
        question.id === id
          ? { ...question, isComplete: !question.isComplete }
          : question
      )
    );
  }

  function updateAnswer(id: number, answerIndex: number, value: string) {
    setQuestions(
      questions.map((question) => {
        if (question.id !== id) return question;

        const updatedAnswers = [...question.answers];
        updatedAnswers[answerIndex] = value;

        return {
          ...question,
          answers: updatedAnswers,
        };
      })
    );
  }

  function updateCorrectAnswer(id: number, answerIndex: number) {
    setQuestions(
      questions.map((question) =>
        question.id === id
          ? { ...question, correctAnswerIndex: answerIndex }
          : question
      )
    );
  }

  function deleteQuestion(id: number) {
    if (questions.length === 1) return;

    const questionIndex = questions.findIndex((question) => question.id === id);
    const updatedQuestions = questions.filter((question) => question.id !== id);

    setQuestions(updatedQuestions);

    if (selectedQuestionId === id) {
      const nextQuestion =
        updatedQuestions[questionIndex] ?? updatedQuestions[questionIndex - 1];

      setSelectedQuestionId(nextQuestion.id);
    }
  }

  function duplicateQuestion(id: number) {
    const questionToCopy = questions.find((question) => question.id === id);
    if (!questionToCopy) return;

    const copiedQuestion: QuizQuestion = {
      ...questionToCopy,
      id: Date.now(),
      question: questionToCopy.question
        ? `${questionToCopy.question} Copy`
        : "Untitled Question Copy",
      isComplete: false,
    };

    const questionIndex = questions.findIndex((question) => question.id === id);
    const updatedQuestions = [...questions];

    updatedQuestions.splice(questionIndex + 1, 0, copiedQuestion);

    setQuestions(updatedQuestions);
    setSelectedQuestionId(copiedQuestion.id);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const oldIndex = questions.findIndex(
      (question) => question.id === active.id
    );
    const newIndex = questions.findIndex((question) => question.id === over.id);

    setQuestions(arrayMove(questions, oldIndex, newIndex));
  }

  return (
    <div
  onPointerDown={onFocusBuilder}
  onFocusCapture={onFocusBuilder}
  className="rounded-xl border border-slate-200 bg-slate-50 p-5"
>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-slate-900">Quiz Questions</h3>
          <p className="text-sm text-slate-500">
            Build the quiz employees must pass after completing the training.
          </p>
        </div>

        <button
          type="button"
          onClick={addQuestion}
          className="company-primary-button rounded-lg px-4 py-2 text-sm font-semibold"
        >
          + Add Question
        </button>
      </div>

      <div
        className={`grid gap-5 transition-all duration-300 ${
          isOutlineCollapsed
            ? "lg:grid-cols-[44px_1fr]"
            : "lg:grid-cols-[280px_1fr]"
        }`}
      >
        <aside className="overflow-hidden rounded-xl border border-slate-200 bg-white transition-all duration-300">
          <div
            className={`flex items-center border-b border-slate-200 p-3 ${
              isOutlineCollapsed ? "justify-center" : "justify-between"
            }`}
          >
            {!isOutlineCollapsed && (
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                Question Outline
              </p>
            )}

            <button
              type="button"
              onClick={() => setIsOutlineCollapsed(!isOutlineCollapsed)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
              title={
                isOutlineCollapsed
                  ? "Expand question outline"
                  : "Collapse question outline"
              }
            >
              {isOutlineCollapsed ? "▶" : "◀"}
            </button>
          </div>

          {isOutlineCollapsed && (
            <div className="flex flex-col items-center gap-2 p-2">
              {questions.map((question, index) => (
                <button
                  key={question.id}
                  type="button"
                  onClick={() => setSelectedQuestionId(question.id)}
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition ${
                    question.id === selectedQuestionId
                      ? "bg-blue-600 text-white"
                      : question.isComplete
                      ? "bg-green-100 text-green-700 hover:bg-green-200"
                      : "bg-amber-100 text-amber-700 hover:bg-amber-200"
                  }`}
                  title={`${question.question || `Question ${index + 1}`} - ${
                    question.isComplete ? "Ready" : "Incomplete"
                  }`}
                >
                  <div className="relative flex h-8 w-8 items-center justify-center">
                    <span>{index + 1}</span>

                    <span
                      className={`absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${
                        question.isComplete
                          ? "bg-green-600 text-white"
                          : "bg-amber-500 text-white"
                      }`}
                    >
                      {question.isComplete ? "✓" : "!"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {!isOutlineCollapsed && (
            <div className="p-3">
              <DndContext
                id="quiz-builder-dnd"
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={questions.map((question) => question.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {questions.map((question, index) => (
                      <SortableQuestionButton
                        key={question.id}
                        question={question}
                        index={index}
                        isSelected={question.id === selectedQuestionId}
                        onSelect={() => setSelectedQuestionId(question.id)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          )}
        </aside>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-5 flex items-start justify-between gap-4 border-b border-slate-200 pb-5">
            <div>
              <p className="text-sm font-semibold text-blue-600">
                Question {selectedQuestionIndex + 1} of {questions.length}
              </p>

              <h4 className="mt-1 text-lg font-bold text-slate-900">
                {selectedQuestion.question || "Untitled Question"}
              </h4>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => toggleQuestionComplete(selectedQuestion.id)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                  selectedQuestion.isComplete
                    ? "border-green-300 bg-green-50 text-green-700 hover:bg-green-100"
                    : "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                }`}
              >
                {selectedQuestion.isComplete
                  ? "Mark Incomplete"
                  : "Mark Complete"}
              </button>

              <button
                type="button"
                onClick={() => duplicateQuestion(selectedQuestion.id)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Duplicate
              </button>

              <button
                type="button"
                onClick={() => deleteQuestion(selectedQuestion.id)}
                disabled={questions.length === 1}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:text-slate-300"
              >
                Delete
              </button>
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700">
                Question Text
              </label>

              <textarea
                value={selectedQuestion.question}
                onChange={(event) =>
                  updateQuestionText(selectedQuestion.id, event.target.value)
                }
                placeholder="Example: What does TIPS stand for?"
                rows={4}
                className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-sm leading-6 text-slate-900 outline-none focus:border-blue-600"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {selectedQuestion.answers.map((answer, answerIndex) => (
                <div key={answerIndex}>
                  <label className="block text-sm font-semibold text-slate-700">
                    Answer {String.fromCharCode(65 + answerIndex)}
                  </label>

                  <input
                    type="text"
                    value={answer}
                    onChange={(event) =>
                      updateAnswer(
                        selectedQuestion.id,
                        answerIndex,
                        event.target.value
                      )
                    }
                    placeholder={`Answer ${String.fromCharCode(
                      65 + answerIndex
                    )}`}
                    className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-600"
                  />
                </div>
              ))}
            </div>

            <div>
  <label className="block text-sm font-semibold text-slate-700">
    Correct Answer
  </label>

  <div className="mt-3 grid gap-3 md:grid-cols-2">
    {selectedQuestion.answers.map((answer, answerIndex) => {
      const isCorrect = selectedQuestion.correctAnswerIndex === answerIndex;

      return (
        <button
          key={answerIndex}
          type="button"
          onClick={() =>
            updateCorrectAnswer(selectedQuestion.id, answerIndex)
          }
          className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition ${
            isCorrect
              ? "border-blue-600 bg-blue-50 text-blue-700"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold ${
              isCorrect
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-slate-300 bg-white text-transparent"
            }`}
          >
            ✓
          </span>

          <span className="font-semibold">
            Answer {String.fromCharCode(65 + answerIndex)}
          </span>

          <span className="min-w-0 truncate text-slate-500">
            {answer || "No answer text yet"}
          </span>
        </button>
      );
    })}
  </div>
</div>
          </div>
        </section>
      </div>
    </div>
  );
}
