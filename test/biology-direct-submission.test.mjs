import assert from "node:assert/strict";
import test from "node:test";
import { biologyQuizAdapter } from "../src/biologyQuizAdapter.js";
import * as submissionStatus from "../src/biologySubmissionStatus.js";
import { QUIZ_DEFINITION } from "../functions/shared/biologyDefinition.js";

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}

test("direct Biology submission derives review progress from the immutable attempt", () => {
  assert.equal(typeof submissionStatus.resolveBiologySubmissionResult, "function");

  const questionOrder = QUIZ_DEFINITION.questions.map(({ id }) => id).reverse();
  const optionOrder = Object.fromEntries(
    QUIZ_DEFINITION.questions.map((question) => [
      question.id,
      question.options.map(({ id }) => id).reverse(),
    ]),
  );
  const review = QUIZ_DEFINITION.questions.map((question) => ({
    questionId: question.id,
    correctOptionId: question.options.find(({ correct }) => correct).id,
    explanation: question.explanation,
  }));
  const answers = Object.fromEntries(
    review.map(({ questionId, correctOptionId }) => [questionId, correctOptionId]),
  );
  answers.q20 = "q20-o3";
  delete answers.q19;
  const attemptSnapshot = deepFreeze(biologyQuizAdapter.restoreAttempt({
    attemptId: "biology-direct-submit-1",
    questionOrder,
    optionOrder,
    answers,
    currentQuestionIndex: 19,
  }));
  const snapshotBefore = structuredClone(attemptSnapshot);
  const previousReviewProgress = deepFreeze({
    q20: {
      errorCount: 2,
      stage: 0,
      lastResult: "wrong",
      lastAttempt: "2026/08/08",
      nextReview: "2026/08/09",
    },
  });

  const confirmed = submissionStatus.resolveBiologySubmissionResult({
    attemptSnapshot,
    previousReviewProgress,
    serverResult: {
      resultType: "score",
      score: 90,
      correctCount: 18,
      wrongCount: 2,
      reviewAvailable: true,
      review,
    },
    today: new Date(2026, 7, 20),
  });

  assert.equal(confirmed.result.reviewAvailable, true);
  assert.equal(confirmed.reviewProgress.q20.errorCount, 3);
  assert.equal(confirmed.reviewProgress.q20.lastResult, "wrong");
  assert.equal(confirmed.reviewProgress.q19.lastResult, "wrong");
  assert.equal(confirmed.reviewProgress.q18.lastResult, "correct");
  assert.deepEqual(attemptSnapshot, snapshotBefore);
  assert.deepEqual(previousReviewProgress, {
    q20: {
      errorCount: 2,
      stage: 0,
      lastResult: "wrong",
      lastAttempt: "2026/08/08",
      nextReview: "2026/08/09",
    },
  });
});
