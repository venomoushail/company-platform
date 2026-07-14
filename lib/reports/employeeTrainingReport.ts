import type {
  QuizAttempt,
  TrainingAssignment,
  TrainingModule,
} from "@/types/supabase";

export type EmployeeTrainingStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "failed"
  | "past_due"
  | "expired";

export type AssignmentReportRow = {
  assignment: TrainingAssignment;
  module: TrainingModule | null;
  status: EmployeeTrainingStatus;
  isPastDue: boolean;
  isFailed: boolean;
  isActiveAssignment: boolean;
  latestScore: number | null;
  bestScore: number | null;
  passed: boolean | null;
  attemptCount: number;
  expirationDate: string | null;
  trainingDurationSeconds: number | null;
  isGraded: boolean;
  attempts: ReportAttempt[];
};

export type ReportAttempt = {
  id: string;
  attemptNumber: number;
  score: number | null;
  passed: boolean | null;
  startedAt: string | null;
  completedAt: string | null;
  durationSeconds: number | null;
};

export type EmployeeReportSummary = {
  totalAssigned: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  failed: number;
  pastDue: number;
  completionRate: number | null;
  averageLatestScore: number | null;
};

function addDays(value: string, days: number) {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, Math.round(value * 10) / 10));
}

function readFiniteNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function reportDiagnostic(message: string, attempt: QuizAttempt, details: object) {
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[employee-reports] ${message}`, {
      attemptId: attempt.id,
      moduleId: attempt.module_id,
      ...details,
    });
  }
}

export function normalizeAttemptScore(attempt: QuizAttempt) {
  const flexibleAttempt = attempt as QuizAttempt & {
    percentage?: unknown;
    score_percentage?: unknown;
  };
  const percentage =
    readFiniteNumber(flexibleAttempt.score_percentage) ??
    readFiniteNumber(flexibleAttempt.percentage);
  if (percentage !== null) return clampPercent(percentage <= 1 ? percentage * 100 : percentage);

  const storedScore = readFiniteNumber(attempt.score);
  const totalQuestions = readFiniteNumber(attempt.total_questions);
  const correctAnswers = readFiniteNumber(attempt.correct_answers);
  const answerDerivedScore =
    totalQuestions !== null &&
    totalQuestions > 0 &&
    correctAnswers !== null &&
    correctAnswers >= 0
      ? clampPercent((correctAnswers / totalQuestions) * 100)
      : null;

  if (storedScore !== null && storedScore >= 0) {
    const normalizedStoredScore = clampPercent(
      storedScore <= 1 ? storedScore * 100 : storedScore
    );

    // quiz_attempts.score is the canonical 0-100 field. Older inconsistent rows
    // can contain score=0 with correct_answers and passed indicating a real pass;
    // the answer counts were written in the same transaction and repair that row.
    if (
      answerDerivedScore !== null &&
      Math.abs(normalizedStoredScore - answerDerivedScore) > 1
    ) {
      reportDiagnostic("Inconsistent stored and answer-derived quiz scores", attempt, {
        storedScore,
        answerDerivedScore,
        passed: attempt.passed,
      });
      return answerDerivedScore;
    }

    return normalizedStoredScore;
  }

  return answerDerivedScore;
}

export function getAttemptDurationSeconds(attempt: QuizAttempt) {
  const storedDuration = readFiniteNumber(attempt.duration_seconds);
  if (storedDuration !== null && storedDuration >= 0 && storedDuration <= 86_400) {
    return Math.round(storedDuration);
  }

  if (!attempt.started_at || !attempt.submitted_at) return null;

  const startedAt = new Date(attempt.started_at).getTime();
  const completedAt = new Date(attempt.submitted_at).getTime();
  const derivedSeconds = Math.round((completedAt - startedAt) / 1000);
  if (
    !Number.isFinite(startedAt) ||
    !Number.isFinite(completedAt) ||
    derivedSeconds < 0 ||
    derivedSeconds > 86_400
  ) {
    reportDiagnostic("Invalid quiz attempt duration", attempt, {
      startedAt: attempt.started_at,
      completedAt: attempt.submitted_at,
      storedDuration: attempt.duration_seconds,
    });
    return null;
  }

  return derivedSeconds;
}

export function getTrainingDurationSeconds(assignment: TrainingAssignment) {
  if (!assignment.started_at || !assignment.completed_at) return null;

  const startedAt = Date.parse(assignment.started_at);
  const completedAt = Date.parse(assignment.completed_at);
  const durationSeconds = Math.round((completedAt - startedAt) / 1000);
  if (
    !Number.isFinite(startedAt) ||
    !Number.isFinite(completedAt) ||
    durationSeconds < 0
  ) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[employee-reports] Invalid training assignment duration", {
        assignmentId: assignment.id,
        startedAt: assignment.started_at,
        completedAt: assignment.completed_at,
      });
    }
    return null;
  }

  // Course duration is elapsed calendar time and may legitimately span days.
  return durationSeconds;
}

export function buildAssignmentReportRow(
  assignment: TrainingAssignment,
  module: TrainingModule | null,
  attempts: QuizAttempt[],
  hasQuiz = attempts.length > 0,
  now = new Date()
): AssignmentReportRow {
  const orderedAttempts = [...attempts].sort(
    (left, right) =>
      right.attempt_number - left.attempt_number ||
      new Date(right.submitted_at).getTime() - new Date(left.submitted_at).getTime()
  );
  const reportAttempts = orderedAttempts.map((attempt) => {
    const score = normalizeAttemptScore(attempt);
    const passed =
      score !== null && module
        ? score >= module.passing_score
        : typeof attempt.passed === "boolean"
          ? attempt.passed
          : null;

    if (score !== null && passed !== attempt.passed) {
      reportDiagnostic("Quiz attempt pass flag conflicts with normalized score", attempt, {
        normalizedScore: score,
        storedPassed: attempt.passed,
        passingScore: module?.passing_score,
      });
    }

    return {
      id: attempt.id,
      attemptNumber: attempt.attempt_number,
      score,
      passed,
      startedAt: attempt.started_at || null,
      completedAt: attempt.submitted_at || null,
      durationSeconds: getAttemptDurationSeconds(attempt),
    };
  });
  const latestAttempt = reportAttempts[0] ?? null;
  const completedScores = reportAttempts
    .map((attempt) => attempt.score)
    .filter((score): score is number => score !== null);
  const latestScore = latestAttempt?.score ?? null;
  const bestScore = completedScores.length > 0 ? Math.max(...completedScores) : null;
  const passed = hasQuiz ? latestAttempt?.passed ?? null : null;
  const isCompleted =
    assignment.status === "completed" &&
    (!hasQuiz || latestAttempt?.passed !== false);
  const isPastDue = Boolean(
    !isCompleted && assignment.due_date && new Date(assignment.due_date) < now
  );
  const isFailed = Boolean(
    !isCompleted &&
      (latestAttempt ? latestAttempt.passed === false : assignment.status === "failed")
  );
  const expirationDate =
    assignment.completed_at && module?.renewal_period_days
      ? addDays(assignment.completed_at, module.renewal_period_days)
      : null;
  const isExpired = Boolean(
    isCompleted && expirationDate && new Date(expirationDate) < now
  );

  let status: EmployeeTrainingStatus = assignment.status;
  if (isExpired) status = "expired";
  else if (isPastDue) status = "past_due";
  else if (isCompleted) status = "completed";
  else if (isFailed) status = "failed";

  return {
    assignment,
    module,
    status,
    isPastDue,
    isFailed,
    isActiveAssignment: module?.status !== "archived",
    latestScore,
    bestScore,
    passed,
    attemptCount: attempts.length,
    expirationDate,
    trainingDurationSeconds: getTrainingDurationSeconds(assignment),
    isGraded: hasQuiz,
    attempts: reportAttempts,
  };
}

export function calculateEmployeeReportSummary(
  rows: AssignmentReportRow[]
): EmployeeReportSummary {
  // Summary rates use active assignments only. Archived modules remain visible in
  // history but do not lower completion rate. Null scores are excluded, not zeroed.
  const activeRows = rows.filter((row) => row.isActiveAssignment);
  const completed = activeRows.filter(
    (row) => row.status === "completed" || row.status === "expired"
  ).length;
  const latestScores = activeRows
    .map((row) => row.latestScore)
    .filter((score): score is number => score !== null);

  return {
    totalAssigned: activeRows.length,
    completed,
    inProgress: activeRows.filter(
      (row) => row.assignment.status === "in_progress" && !row.isFailed
    ).length,
    notStarted: activeRows.filter(
      (row) => row.assignment.status === "not_started"
    ).length,
    failed: activeRows.filter((row) => row.isFailed).length,
    pastDue: activeRows.filter((row) => row.isPastDue).length,
    completionRate:
      activeRows.length > 0 ? Math.round((completed / activeRows.length) * 100) : null,
    averageLatestScore:
      latestScores.length > 0
        ? Math.round(
            (latestScores.reduce((total, score) => total + score, 0) /
              latestScores.length) *
              10
          ) / 10
        : null,
  };
}
