import { normalizeQuizProgress } from "./progressDomain.js";
import {
  getQuizDefinition,
  validateQuizSubmission,
} from "./shared/quizRegistry.js";

const ATTEMPT_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const PROGRESS_INPUT_FIELDS = new Set([
  "studentCode",
  "studentName",
  "studentId",
  "quizId",
  "quizVersion",
  "activeAttempt",
  "reviewProgress",
]);

export function requireAnonymousAuth(auth) {
  if (
    typeof auth?.uid !== "string"
    || auth.uid.length === 0
    || auth.token?.firebase?.sign_in_provider !== "anonymous"
  ) {
    throw new Error("anonymous-auth-required");
  }
  return auth;
}

function requireQuiz(input) {
  const definition = getQuizDefinition(input?.quizId, input?.quizVersion);
  if (!definition) throw new Error("invalid-quiz");
  return definition;
}

function progressPayload(input, definition) {
  if (
    input === null
    || typeof input !== "object"
    || Array.isArray(input)
    || Object.keys(input).some((key) => !PROGRESS_INPUT_FIELDS.has(key))
  ) {
    throw new Error("invalid-progress-payload");
  }
  return normalizeQuizProgress(definition, {
    activeAttempt: input?.activeAttempt,
    reviewProgress: input?.reviewProgress,
  });
}

function emptyProgress(studentId, definition) {
  return {
    studentId,
    quizId: definition.id,
    quizVersion: definition.version,
    kind: definition.kind,
    activeAttempt: null,
    reviewProgress: {},
    updatedAt: null,
    updatedByUid: null,
  };
}

export async function loadProgress({ repository, auth, input }) {
  requireAnonymousAuth(auth);
  const definition = requireQuiz(input);
  const student = await repository.resolveStudent(input);
  const stored = await repository.getProgress(student.studentId, definition.id);
  return stored ?? emptyProgress(student.studentId, definition);
}

export async function saveProgress({ repository, auth, input, now }) {
  requireAnonymousAuth(auth);
  const definition = requireQuiz(input);
  const normalized = progressPayload(input, definition);

  return repository.runTransaction(async (transaction) => {
    const student = await repository.resolveStudent(input, transaction);
    if (normalized.activeAttempt) {
      const completed = await repository.getAttempt(
        normalized.activeAttempt.attemptId,
        transaction,
      );
      if (completed) {
        if (completed.studentId !== student.studentId || completed.quizId !== definition.id) {
          throw new Error("attempt-id-conflict");
        }
        return await repository.getProgress(student.studentId, definition.id, transaction)
          ?? emptyProgress(student.studentId, definition);
      }
    }
    const progress = {
      studentId: student.studentId,
      quizId: definition.id,
      quizVersion: definition.version,
      kind: definition.kind,
      ...normalized,
      updatedAt: now,
      updatedByUid: auth.uid,
    };
    await repository.setProgress(student.studentId, definition.id, progress, transaction);
    return progress;
  });
}

function attemptResult(attemptId, attempt) {
  return { attemptId, ...attempt };
}

function validateAttemptId(attemptId) {
  if (typeof attemptId !== "string" || !ATTEMPT_ID_PATTERN.test(attemptId)) {
    throw new Error("invalid-submission");
  }
  return attemptId;
}

function publicResult(result) {
  if (result.resultType === "score") {
    return {
      resultType: "score",
      score: result.score,
      correctCount: result.correctCount,
      wrongCount: result.wrongCount,
    };
  }
  if (result.resultType === "placement") {
    return {
      resultType: "placement",
      completedCount: result.completedCount,
      totalItems: result.totalItems,
      errorCount: result.errorCount,
      durationSeconds: result.durationSeconds,
      completed: result.completed,
    };
  }
  throw new Error("invalid-submission");
}

export async function submitAttempt({ repository, auth, input, maskedIp, now }) {
  requireAnonymousAuth(auth);
  const attemptId = validateAttemptId(input?.attemptId);

  return repository.runTransaction(async (transaction) => {
    const student = await repository.resolveStudent(input, transaction);
    const stored = await repository.getAttempt(attemptId, transaction);
    if (stored) {
      if (stored.studentId !== student.studentId || stored.quizId !== input?.quizId) {
        throw new Error("attempt-id-conflict");
      }
      return attemptResult(attemptId, stored);
    }

    const definition = requireQuiz(input);
    const result = validateQuizSubmission(definition, input);
    const normalized = normalizeQuizProgress(definition, {
      activeAttempt: null,
      reviewProgress: input?.reviewProgress ?? {},
    });
    const currentProgress = await repository.getProgress(
      student.studentId,
      definition.id,
      transaction,
    );
    const attempt = {
      quizId: definition.id,
      quizVersion: definition.version,
      quizKind: definition.kind,
      quizTitle: definition.title,
      subject: definition.subject,
      studentUid: auth.uid,
      studentId: student.studentId,
      studentCode: student.studentCode,
      studentName: student.studentName,
      submittedAt: now,
      ...publicResult(result),
    };
    const progress = {
      studentId: student.studentId,
      quizId: definition.id,
      quizVersion: definition.version,
      kind: definition.kind,
      activeAttempt: null,
      reviewProgress: {
        ...(currentProgress?.reviewProgress ?? {}),
        ...normalized.reviewProgress,
      },
      updatedAt: now,
      updatedByUid: auth.uid,
    };

    await repository.createAttemptRecords(
      attemptId,
      attempt,
      { maskedIp, createdAt: now },
      transaction,
    );
    await repository.setProgress(student.studentId, definition.id, progress, transaction);
    return attemptResult(attemptId, attempt);
  });
}
