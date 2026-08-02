function invalidProgressPayload() {
  throw new Error("invalid-progress-payload");
}

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

function normalizedQuestionMap(quizDefinition) {
  if (!isRecord(quizDefinition) || !Array.isArray(quizDefinition.questions)) {
    invalidProgressPayload();
  }
  const questions = quizDefinition.questions;
  const questionIds = questions.map(({ id }) => id);
  if (
    questionIds.length === 0
    || questionIds.some((id) => typeof id !== "string")
    || new Set(questionIds).size !== questionIds.length
  ) {
    invalidProgressPayload();
  }
  return new Map(questions.map((question) => [question.id, question]));
}

function normalizeActiveAttempt(value, questionMap) {
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
    typeof attemptId !== "string"
    || attemptId.trim().length === 0
    || attemptId.length > 128
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
    const optionIds = questionMap.get(questionId)?.options?.map(({ id }) => id);
    if (!hasExactMembers(optionIds, optionIds) || !hasExactMembers(optionOrder[questionId], optionIds)) {
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
    attemptId: attemptId.trim(),
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
    || typeof value.lastAttempt !== "string"
    || typeof value.nextReview !== "string"
  ) {
    invalidProgressPayload();
  }
  return { ...value };
}

function normalizeReviewProgress(value, questionMap) {
  const questionIds = [...questionMap.keys()];
  if (!hasOnlyKeys(value, questionIds)) invalidProgressPayload();
  return Object.fromEntries(
    Object.entries(value).map(([questionId, entry]) => [questionId, normalizeReviewEntry(entry)]),
  );
}

export function normalizeProgressPayload(input, quizDefinition) {
  if (!hasExactKeys(input, ["activeAttempt", "reviewProgress"])) invalidProgressPayload();
  const questionMap = normalizedQuestionMap(quizDefinition);
  return {
    activeAttempt: normalizeActiveAttempt(input.activeAttempt, questionMap),
    reviewProgress: normalizeReviewProgress(input.reviewProgress, questionMap),
  };
}
