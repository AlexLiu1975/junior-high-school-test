import { normalizeQuizProgress } from "./progressDomain.js";
import {
  getQuizDefinition,
  validateQuizSubmission,
} from "./shared/quizRegistry.js";
import { buildReviewPayload } from "./shared/reviewPayload.js";

const ATTEMPT_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const PROGRESS_INPUT_FIELDS = new Set([
  "studentCode",
  "studentName",
  "studentId",
  "quizId",
  "quizVersion",
  "baseRevision",
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
  if (!Number.isSafeInteger(input.baseRevision) || input.baseRevision < 0) {
    throw new Error("invalid-progress-payload");
  }
  return {
    baseRevision: input.baseRevision,
    ...normalizeQuizProgress(definition, {
      activeAttempt: input?.activeAttempt,
      reviewProgress: input?.reviewProgress,
    }),
  };
}

function progressRevision(progress) {
  return Number.isSafeInteger(progress?.revision) && progress.revision >= 0
    ? progress.revision
    : 0;
}

function withProgressRevision(progress) {
  return { ...progress, revision: progressRevision(progress) };
}

function emptyProgress(studentId, definition) {
  return {
    studentId,
    quizId: definition.id,
    quizVersion: definition.version,
    kind: definition.kind,
    revision: 0,
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
  return stored
    ? withProgressRevision(stored)
    : emptyProgress(student.studentId, definition);
}

export async function saveProgress({ repository, auth, input, now }) {
  requireAnonymousAuth(auth);
  const definition = requireQuiz(input);
  const normalized = progressPayload(input, definition);

  return repository.runTransaction(async (transaction) => {
    const student = await repository.resolveStudent(input, transaction);
    const currentProgress = await repository.getProgress(
      student.studentId,
      definition.id,
      transaction,
    );
    const currentRevision = progressRevision(currentProgress);
    if (normalized.baseRevision !== currentRevision) {
      throw new Error("progress-conflict");
    }
    if (normalized.activeAttempt) {
      const completed = await repository.getAttempt(
        normalized.activeAttempt.attemptId,
        transaction,
      );
      if (completed) {
        requireStoredAttemptIdentity(completed, student, definition);
        return currentProgress
          ? withProgressRevision(currentProgress)
          : emptyProgress(student.studentId, definition);
      }
    }
    const progress = {
      studentId: student.studentId,
      quizId: definition.id,
      quizVersion: definition.version,
      kind: definition.kind,
      revision: currentRevision + 1,
      activeAttempt: normalized.activeAttempt,
      reviewProgress: normalized.reviewProgress,
      updatedAt: now,
      updatedByUid: auth.uid,
    };
    await repository.setProgress(student.studentId, definition.id, progress, transaction);
    return progress;
  });
}

function validateAttemptId(attemptId) {
  if (typeof attemptId !== "string" || !ATTEMPT_ID_PATTERN.test(attemptId)) {
    throw new Error("invalid-submission");
  }
  return attemptId;
}

function attemptIdConflict() {
  throw new Error("attempt-id-conflict");
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function isBoundedInteger(value, max) {
  return Number.isInteger(value) && value >= 0 && value <= max;
}

function requireStoredAttemptIdentity(stored, student, definition) {
  if (stored?.studentId !== student.studentId) attemptIdConflict();
  if (
    stored.quizId === definition.id
    && stored.quizVersion === definition.version
    && stored.quizKind === definition.kind
  ) {
    return "current";
  }

  const isDocumentedLegacyBiology = definition.kind === "multiple-choice"
    && Array.isArray(definition.legacyAttemptQuizIds)
    && definition.legacyAttemptQuizIds.includes(stored.quizId)
    && stored.quizVersion === undefined
    && stored.quizKind === undefined
    && stored.subject === undefined
    && stored.resultType === undefined;
  if (isDocumentedLegacyBiology) return "legacy-score";
  attemptIdConflict();
}

function projectStoredBase(attemptId, stored, definition) {
  if (
    !isNonEmptyString(stored.studentUid)
    || !isNonEmptyString(stored.studentId)
    || !isNonEmptyString(stored.studentCode)
    || !isNonEmptyString(stored.studentName)
    || stored.submittedAt === null
    || stored.submittedAt === undefined
  ) {
    attemptIdConflict();
  }
  return {
    attemptId,
    quizId: definition.id,
    quizVersion: definition.version,
    quizKind: definition.kind,
    quizTitle: definition.title,
    subject: definition.subject,
    studentUid: stored.studentUid,
    studentId: stored.studentId,
    studentCode: stored.studentCode,
    studentName: stored.studentName,
    submittedAt: stored.submittedAt,
  };
}

function projectStoredScore(attemptId, stored, definition, mode) {
  const placementFields = [
    "completedCount", "totalItems", "errorCount", "durationSeconds", "completed",
  ];
  const questionIds = new Set(definition.questions.map(({ id }) => id));
  const hasWrongIds = Object.hasOwn(stored, "wrongIds");
  const hasValidWrongIds = !hasWrongIds
    ? true
    : Array.isArray(stored.wrongIds)
      && stored.wrongIds.length === stored.wrongCount
      && new Set(stored.wrongIds).size === stored.wrongIds.length
      && stored.wrongIds.every((questionId) => questionIds.has(questionId));
  if (
    definition.kind !== "multiple-choice"
    || (mode === "current" && stored.resultType !== "score")
    || (mode === "legacy-score" && stored.resultType !== undefined)
    || placementFields.some((field) => Object.hasOwn(stored, field))
    || !Number.isFinite(stored.score)
    || stored.score < 0
    || stored.score > 100
    || !isBoundedInteger(stored.correctCount, definition.questions.length)
    || !isBoundedInteger(stored.wrongCount, definition.questions.length)
    || stored.correctCount + stored.wrongCount !== definition.questions.length
    || !hasValidWrongIds
  ) {
    attemptIdConflict();
  }
  const projected = {
    ...projectStoredBase(attemptId, stored, definition),
    resultType: "score",
    score: stored.score,
    correctCount: stored.correctCount,
    wrongCount: stored.wrongCount,
  };
  if (hasWrongIds) projected.wrongIds = [...stored.wrongIds];
  if (hasWrongIds) projected.review = buildReviewPayload(definition, stored.wrongIds);
  return projected;
}

function projectStoredPlacement(attemptId, stored, definition, mode) {
  const scoreFields = ["score", "correctCount", "wrongCount", "wrongIds"];
  const totalItems = definition.elements?.length;
  if (
    mode !== "current"
    || definition.kind !== "placement"
    || stored.resultType !== "placement"
    || scoreFields.some((field) => Object.hasOwn(stored, field))
    || !Number.isInteger(totalItems)
    || stored.completedCount !== totalItems
    || stored.totalItems !== totalItems
    || !isBoundedInteger(stored.errorCount, 100000)
    || !isBoundedInteger(stored.durationSeconds, 604800)
    || stored.completed !== true
  ) {
    attemptIdConflict();
  }
  return {
    ...projectStoredBase(attemptId, stored, definition),
    resultType: "placement",
    completedCount: stored.completedCount,
    totalItems: stored.totalItems,
    errorCount: stored.errorCount,
    durationSeconds: stored.durationSeconds,
    completed: true,
  };
}

function projectStoredAttempt(attemptId, stored, student, definition) {
  const mode = requireStoredAttemptIdentity(stored, student, definition);
  if (definition.kind === "multiple-choice") {
    return projectStoredScore(attemptId, stored, definition, mode);
  }
  if (definition.kind === "placement") {
    return projectStoredPlacement(attemptId, stored, definition, mode);
  }
  attemptIdConflict();
}

function publicResult(result) {
  if (result.resultType === "score") {
    return {
      resultType: "score",
      score: result.score,
      correctCount: result.correctCount,
      wrongCount: result.wrongCount,
      wrongIds: [...result.wrongIds],
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
  const definition = requireQuiz(input);

  return repository.runTransaction(async (transaction) => {
    const student = await repository.resolveStudent(input, transaction);
    const stored = await repository.getAttempt(attemptId, transaction);
    if (stored) {
      return projectStoredAttempt(attemptId, stored, student, definition);
    }

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
      revision: progressRevision(currentProgress) + 1,
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
    return {
      attemptId,
      ...attempt,
      ...(result.resultType === "score"
        ? { review: buildReviewPayload(definition, result.wrongIds) }
        : {}),
    };
  });
}
