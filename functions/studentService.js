import { normalizeProgressPayload } from "./progressDomain.js";
import { getQuizDefinition } from "./shared/quizDefinition.js";
import { validateAndScoreSubmission } from "./shared/quizSubmissionDomain.js";

const ATTEMPT_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

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
  return normalizeProgressPayload({
    activeAttempt: input?.activeAttempt,
    reviewProgress: input?.reviewProgress,
  }, definition);
}

function emptyProgress(studentId, quizId) {
  return {
    studentId,
    quizId,
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
  return stored ?? emptyProgress(student.studentId, definition.id);
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
          ?? emptyProgress(student.studentId, definition.id);
      }
    }
    const progress = {
      studentId: student.studentId,
      quizId: definition.id,
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
    const scoring = validateAndScoreSubmission(input);
    const normalized = normalizeProgressPayload({
      activeAttempt: null,
      reviewProgress: input?.reviewProgress,
    }, definition);
    const currentProgress = await repository.getProgress(
      student.studentId,
      definition.id,
      transaction,
    );
    const attempt = {
      quizId: definition.id,
      quizTitle: definition.title,
      studentUid: auth.uid,
      studentId: student.studentId,
      studentCode: student.studentCode,
      studentName: student.studentName,
      score: scoring.score,
      correctCount: scoring.correctCount,
      wrongCount: scoring.wrongCount,
      submittedAt: now,
    };
    const progress = {
      studentId: student.studentId,
      quizId: definition.id,
      activeAttempt: null,
      reviewProgress: {
        ...(currentProgress?.reviewProgress ?? {}),
        ...normalized.reviewProgress,
      },
      updatedAt: now,
      updatedByUid: auth.uid,
    };

    await repository.createAttempt(attemptId, attempt, transaction);
    await repository.createPrivateAttempt(attemptId, { maskedIp, createdAt: now }, transaction);
    await repository.setProgress(student.studentId, definition.id, progress, transaction);
    return attemptResult(attemptId, attempt);
  });
}
