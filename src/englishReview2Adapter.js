import { ENGLISH_REVIEW_2 } from "../functions/shared/englishReview2Definition.js";

const questionOrder = ENGLISH_REVIEW_2.questions.map(({ id }) => id);
const optionOrder = Object.fromEntries(
  ENGLISH_REVIEW_2.questions.map((question) => [
    question.id,
    question.options.map(({ id }) => id),
  ]),
);
const optionIdsByQuestion = new Map(
  Object.entries(optionOrder).map(([questionId, ids]) => [questionId, new Set(ids)]),
);

function invalidAttempt() {
  throw new Error("invalid-english-attempt");
}

function cloneAnswers(answers) {
  if (answers === null || typeof answers !== "object" || Array.isArray(answers)) invalidAttempt();
  const cloned = {};
  for (const [questionId, optionId] of Object.entries(answers)) {
    if (!optionIdsByQuestion.get(questionId)?.has(optionId)) invalidAttempt();
    cloned[questionId] = optionId;
  }
  return cloned;
}

function normalizeLastAnsweredId(lastAnsweredId, answers) {
  if (lastAnsweredId === null || lastAnsweredId === undefined) return null;
  if (!optionIdsByQuestion.has(lastAnsweredId) || !Object.hasOwn(answers, lastAnsweredId)) {
    invalidAttempt();
  }
  return lastAnsweredId;
}

function canonicalAttempt({ attemptId, answers = {}, lastAnsweredId = null }) {
  if (typeof attemptId !== "string" || attemptId.length === 0) invalidAttempt();
  const clonedAnswers = cloneAnswers(answers);
  const normalizedLastAnsweredId = normalizeLastAnsweredId(lastAnsweredId, clonedAnswers);
  return {
    attemptId,
    questionOrder: [...questionOrder],
    optionOrder: Object.fromEntries(
      questionOrder.map((questionId) => [questionId, [...optionOrder[questionId]]]),
    ),
    answers: clonedAnswers,
    currentQuestionIndex: normalizedLastAnsweredId === null
      ? 0
      : questionOrder.indexOf(normalizedLastAnsweredId),
    lastAnsweredId: normalizedLastAnsweredId,
  };
}

function fromStoredAttempt(saved) {
  if (saved === null || typeof saved !== "object" || Array.isArray(saved)) invalidAttempt();
  if (Array.isArray(saved.questionOrder)
    && !saved.questionOrder.every((id, index) => id === questionOrder[index])) invalidAttempt();
  if (saved.optionOrder !== undefined) {
    if (saved.optionOrder === null || typeof saved.optionOrder !== "object") invalidAttempt();
    for (const questionId of questionOrder) {
      if (!Array.isArray(saved.optionOrder[questionId])
        || !saved.optionOrder[questionId].every((id, index) => id === optionOrder[questionId][index])) {
        invalidAttempt();
      }
    }
  }
  if (saved.lastAnsweredId !== undefined
    && saved.lastAnsweredId !== null
    && !optionIdsByQuestion.has(saved.lastAnsweredId)) invalidAttempt();
  const derivedLastAnsweredId = saved.lastAnsweredId
    ?? (Number.isInteger(saved.currentQuestionIndex) ? questionOrder[saved.currentQuestionIndex] : null);
  return canonicalAttempt({
    attemptId: saved.attemptId,
    answers: saved.answers,
    lastAnsweredId: derivedLastAnsweredId && Object.hasOwn(saved.answers ?? {}, derivedLastAnsweredId)
      ? derivedLastAnsweredId
      : null,
  });
}

export const englishReview2Adapter = Object.freeze({
  createAttempt({ attemptId = crypto.randomUUID() } = {}) {
    return canonicalAttempt({ attemptId, answers: {}, lastAnsweredId: null });
  },

  restoreAttempt(saved) {
    return fromStoredAttempt(saved);
  },

  serializeProgress(state) {
    const attempt = canonicalAttempt(state);
    // The approved cloud schema carries this position as the canonical question index.
    // lastAnsweredId is reconstructed from that index after cloud/local progress selection.
    const { lastAnsweredId: _lastAnsweredId, ...activeAttempt } = attempt;
    return { activeAttempt, reviewProgress: {} };
  },

  buildSubmission(state) {
    const attempt = canonicalAttempt(state);
    return {
      attemptId: attempt.attemptId,
      questionOrder: attempt.questionOrder,
      optionOrder: attempt.optionOrder,
      answers: attempt.answers,
      reviewProgress: {},
    };
  },

  getUnansweredCount(answers) {
    return questionOrder.length - Object.keys(cloneAnswers(answers)).length;
  },

  restoreConfirmedSubmission({ currentAttempt, submission, result }) {
    if (submission?.attemptId !== currentAttempt?.attemptId) invalidAttempt();
    return {
      attempt: canonicalAttempt({
        attemptId: submission.attemptId,
        answers: submission.answers,
        lastAnsweredId: currentAttempt.lastAnsweredId,
      }),
      result: englishReview2Adapter.renderResult(result),
    };
  },

  renderResult(result) {
    const hasWrongIds = Object.hasOwn(result ?? {}, "wrongIds");
    if (result?.resultType !== "score"
      || !Number.isFinite(result.score)
      || result.score < 0
      || result.score > 100
      || !Number.isInteger(result.correctCount)
      || !Number.isInteger(result.wrongCount)
      || result.correctCount < 0
      || result.wrongCount < 0
      || result.correctCount + result.wrongCount !== questionOrder.length
      || (hasWrongIds && (
        !Array.isArray(result.wrongIds)
        || result.wrongIds.length !== result.wrongCount
        || new Set(result.wrongIds).size !== result.wrongIds.length
        || result.wrongIds.some((questionId) => !optionIdsByQuestion.has(questionId))
      ))) {
      throw new Error("invalid-english-result");
    }
    if (!hasWrongIds) {
      return {
        score: result.score,
        correctCount: result.correctCount,
        wrongCount: result.wrongCount,
        wrongIds: null,
        reviewAvailable: false,
      };
    }
    return {
      score: result.score,
      correctCount: result.correctCount,
      wrongCount: result.wrongCount,
      wrongIds: [...result.wrongIds],
    };
  },
});
