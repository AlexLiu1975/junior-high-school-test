function invalidProgressPayload() {
  throw new Error("invalid-progress-payload");
}

const ATTEMPT_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const CANONICAL_DATE_PATTERN = /^(\d{4})\/(\d{2})\/(\d{2})$/;
const MAX_ERROR_COUNT = 100000;
const MAX_ACCUMULATED_SECONDS = 604800;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value, keys) {
  return isRecord(value) && Object.keys(value).every((key) => keys.includes(key));
}

function hasExactKeys(value, keys) {
  return hasOnlyKeys(value, keys) && Object.keys(value).length === keys.length;
}

function hasExactMembers(value, expected) {
  return Array.isArray(value)
    && value.length === expected.length
    && new Set(value).size === expected.length
    && expected.every((item) => value.includes(item));
}

function isAttemptId(value) {
  return typeof value === "string" && ATTEMPT_ID_PATTERN.test(value);
}

function isBoundedInteger(value, max) {
  return Number.isInteger(value) && value >= 0 && value <= max;
}

function normalizedQuestionMap(definition) {
  if (!isRecord(definition) || !Array.isArray(definition.questions)) {
    invalidProgressPayload();
  }
  const questions = definition.questions;
  const questionIds = questions.map(({ id }) => id);
  if (
    questionIds.length === 0
    || questionIds.some((id) => typeof id !== "string")
    || new Set(questionIds).size !== questionIds.length
  ) {
    invalidProgressPayload();
  }
  for (const question of questions) {
    const optionIds = question.options?.map(({ id }) => id);
    if (
      !Array.isArray(optionIds)
      || optionIds.length === 0
      || optionIds.some((id) => typeof id !== "string")
      || new Set(optionIds).size !== optionIds.length
    ) {
      invalidProgressPayload();
    }
  }
  return new Map(questions.map((question) => [question.id, question]));
}

function isCanonicalDate(value) {
  const match = typeof value === "string" && value.match(CANONICAL_DATE_PATTERN);
  if (!match) return false;

  const [year, month, day] = match.slice(1).map(Number);
  if (year < 1) return false;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function normalizeMultipleChoiceAttempt(value, questionMap) {
  if (value === null) return null;
  const questionIds = [...questionMap.keys()];
  const expectedKeys = [
    "attemptId",
    "questionOrder",
    "optionOrder",
    "answers",
    "currentQuestionIndex",
  ];
  if (!hasExactKeys(value, expectedKeys)) invalidProgressPayload();

  const { attemptId, questionOrder, optionOrder, answers, currentQuestionIndex } = value;
  if (
    !isAttemptId(attemptId)
    || !hasExactMembers(questionOrder, questionIds)
    || !hasExactKeys(optionOrder, questionIds)
    || !hasOnlyKeys(answers, questionIds)
    || !Number.isInteger(currentQuestionIndex)
    || currentQuestionIndex < 0
    || currentQuestionIndex >= questionIds.length
  ) {
    invalidProgressPayload();
  }

  const normalizedOptionOrder = {};
  const normalizedAnswers = {};
  for (const questionId of questionIds) {
    const optionIds = questionMap.get(questionId).options.map(({ id }) => id);
    if (!hasExactMembers(optionOrder[questionId], optionIds)) {
      invalidProgressPayload();
    }
    normalizedOptionOrder[questionId] = [...optionOrder[questionId]];

    if (Object.hasOwn(answers, questionId)) {
      if (typeof answers[questionId] !== "string" || !optionIds.includes(answers[questionId])) {
        invalidProgressPayload();
      }
      normalizedAnswers[questionId] = answers[questionId];
    }
  }

  return {
    attemptId,
    questionOrder: [...questionOrder],
    optionOrder: normalizedOptionOrder,
    answers: normalizedAnswers,
    currentQuestionIndex,
  };
}

function normalizeReviewEntry(value) {
  const expectedKeys = ["errorCount", "stage", "lastResult", "lastAttempt", "nextReview"];
  if (
    !hasExactKeys(value, expectedKeys)
    || !Number.isSafeInteger(value.errorCount)
    || value.errorCount < 0
    || !Number.isSafeInteger(value.stage)
    || value.stage < -1
    || value.stage > 5
    || !["correct", "wrong"].includes(value.lastResult)
    || !isCanonicalDate(value.lastAttempt)
    || !isCanonicalDate(value.nextReview)
  ) {
    invalidProgressPayload();
  }
  return { ...value };
}

function normalizeReviewProgress(value, questionMap, supported) {
  const questionIds = [...questionMap.keys()];
  if (!hasOnlyKeys(value, supported ? questionIds : [])) invalidProgressPayload();
  return Object.fromEntries(
    Object.entries(value).map(([questionId, entry]) => [questionId, normalizeReviewEntry(entry)]),
  );
}

function normalizeMultipleChoiceProgress(definition, input) {
  if (!hasExactKeys(input, ["activeAttempt", "reviewProgress"])) {
    invalidProgressPayload();
  }
  const questionMap = normalizedQuestionMap(definition);
  return {
    activeAttempt: normalizeMultipleChoiceAttempt(input.activeAttempt, questionMap),
    reviewProgress: normalizeReviewProgress(
      input.reviewProgress,
      questionMap,
      definition.supportsReviewProgress === true,
    ),
  };
}

function normalizedElementIds(definition) {
  if (!isRecord(definition) || !Array.isArray(definition.elements)) {
    invalidProgressPayload();
  }
  const elementIds = definition.elements.map(({ id }) => id);
  if (
    elementIds.length === 0
    || elementIds.some((id) => typeof id !== "string")
    || new Set(elementIds).size !== elementIds.length
  ) {
    invalidProgressPayload();
  }
  return elementIds;
}

function normalizePlacementAttempt(value, elementIds) {
  if (value === null) return null;
  const expectedKeys = [
    "attemptId",
    "poolOrder",
    "placedElementIds",
    "errorCount",
    "accumulatedSeconds",
    "timerState",
  ];
  if (!hasExactKeys(value, expectedKeys)) invalidProgressPayload();
  const {
    attemptId,
    poolOrder,
    placedElementIds,
    errorCount,
    accumulatedSeconds,
    timerState,
  } = value;
  const knownElementIds = new Set(elementIds);
  if (
    !isAttemptId(attemptId)
    || !hasExactMembers(poolOrder, elementIds)
    || !Array.isArray(placedElementIds)
    || new Set(placedElementIds).size !== placedElementIds.length
    || placedElementIds.some((id) => !knownElementIds.has(id))
    || !isBoundedInteger(errorCount, MAX_ERROR_COUNT)
    || !isBoundedInteger(accumulatedSeconds, MAX_ACCUMULATED_SECONDS)
    || !["running", "paused"].includes(timerState)
  ) {
    invalidProgressPayload();
  }
  return {
    attemptId,
    poolOrder: [...poolOrder],
    placedElementIds: [...placedElementIds],
    errorCount,
    accumulatedSeconds,
    timerState,
  };
}

function normalizePlacementProgress(definition, input) {
  if (
    !hasExactKeys(input, ["activeAttempt", "reviewProgress"])
    || !hasExactKeys(input.reviewProgress, [])
  ) {
    invalidProgressPayload();
  }
  return {
    activeAttempt: normalizePlacementAttempt(input.activeAttempt, normalizedElementIds(definition)),
    reviewProgress: {},
  };
}

export function normalizeQuizProgress(definition, input) {
  if (definition?.kind === "multiple-choice") {
    return normalizeMultipleChoiceProgress(definition, input);
  }
  if (definition?.kind === "placement") {
    return normalizePlacementProgress(definition, input);
  }
  invalidProgressPayload();
}
