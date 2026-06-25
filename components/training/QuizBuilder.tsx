"use client";

import { useState } from "react";
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

type QuizQuestion = {
  id: number;
  question: string;
  answers: string[];
  correctAnswerIndex: number;
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
    <div
      ref={setNodeRef}
      style={style}
      className={`${isDragging ? "opacity-60" : ""}`}
    >
      <button
        type="button"
        onClick={onSelect}
        className={`w-full rounded-lg border px-3 py-3 text-left text-sm transition ${
          isSelected
            ? "border-blue-600 bg-blue-50 text-blue-700"
            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        }`}
      >
        <div className="flex items-start gap-3">
          <span
            {...attributes}
            {...listeners}
            className={`mt-0.5 flex h-7 w-7 shrink-0 cursor-grab items-center justify-center rounded-full text-xs font-bold active:cursor-grabbing ${
              isSelected
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-500"
            }`}
            title="Drag to reorder"
          >
            ☰
          </span>

          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">
              {index + 1}. {question.question || "Untitled Question"}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              {answeredCount} of {question.answers.length} answers filled
            </p>

            <p className="mt-2 text-xs text-slate-400">
              Correct: Answer {String.fromCharCode(65 + question.correctAnswerIndex)}
            </p>
          </div>
        </div>
      </button>
    </div>
  );
}

export default function QuizBuilder() {
  const [questions, setQuestions] = useState<QuizQuestion[]>([
    {
      id: 1,
      question: "",
      answers: ["", "", "", ""],
      correctAnswerIndex: 0,
    },
  ]);

  const [selectedQuestionId, setSelectedQuestionId] = useState(1);

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
    const newQuestion = {
      id: Date.now(),
      question: "",
      answers: ["", "", "", ""],
      correctAnswerIndex: 0,
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
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
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
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          + Add Question
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="mb-3 px-2 text-xs font-bold uppercase tracking-wide text-slate-400">
            Question Outline
          </p>

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

              <select
                value={selectedQuestion.correctAnswerIndex}
                onChange={(event) =>
                  updateCorrectAnswer(
                    selectedQuestion.id,
                    Number(event.target.value)
                  )
                }
                className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-600"
              >
                {selectedQuestion.answers.map((_, answerIndex) => (
                  <option key={answerIndex} value={answerIndex}>
                    Answer {String.fromCharCode(65 + answerIndex)}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-bold text-slate-900">
                Employee Preview
              </p>

              <p className="mt-3 text-sm font-semibold text-slate-700">
                {selectedQuestion.question || "Question text will appear here."}
              </p>

              <div className="mt-3 space-y-2">
                {selectedQuestion.answers.map((answer, answerIndex) => (
                  <div
                    key={answerIndex}
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      answerIndex === selectedQuestion.correctAnswerIndex
                        ? "border-green-300 bg-green-50 text-green-800"
                        : "border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    <span className="font-semibold">
                      {String.fromCharCode(65 + answerIndex)}.
                    </span>{" "}
                    {answer || `Answer ${String.fromCharCode(65 + answerIndex)}`}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}