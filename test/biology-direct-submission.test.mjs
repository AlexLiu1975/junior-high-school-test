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
const previousReviewProgress = deepFreeze({
  q20: {
    errorCount: 2,
    stage: 0,
    lastResult: "wrong",
    lastAttempt: "2026/08/08",
    nextReview: "2026/08/09",
  },
});
const fullServerResult = {
  resultType: "score",
  score: 90,
  correctCount: 18,
  wrongCount: 2,
  reviewAvailable: true,
  review,
};

test("direct Biology submission owns submit and derives progress from the immutable attempt", async () => {
  assert.equal(typeof submissionStatus.submitBiologyAttempt, "function");
  const snapshotBefore = structuredClone(attemptSnapshot);
  let submitted;

  const confirmed = await submissionStatus.submitBiologyAttempt({
    sync: {
      async submit(submission) {
        submitted = submission;
        return fullServerResult;
      },
    },
    attemptSnapshot,
    previousReviewProgress,
    today: new Date(2026, 7, 20),
  });

  assert.equal(submitted.attemptId, "biology-direct-submit-1");
  assert.deepEqual(submitted.answers, answers);
  assert.deepEqual(submitted.reviewProgress, previousReviewProgress);
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

test("direct Biology submit rejection remains an unconfirmed failure", async () => {
  assert.equal(typeof submissionStatus.submitBiologyAttempt, "function");
  await assert.rejects(
    submissionStatus.submitBiologyAttempt({
      sync: {
        async submit() {
          throw new Error("offline");
        },
      },
      attemptSnapshot,
      previousReviewProgress,
    }),
    (error) => {
      assert.equal(error.submissionConfirmed, false);
      assert.equal(
        submissionStatus.biologySubmissionFailureMessage({
          confirmed: error.submissionConfirmed,
        }),
        "作答紀錄尚未送出，資料已保留；請檢查網路後重試。",
      );
      return true;
    },
  );
});

test("malformed processing after submit resolution uses the confirmed failure message", async () => {
  assert.equal(typeof submissionStatus.submitBiologyAttempt, "function");
  await assert.rejects(
    submissionStatus.submitBiologyAttempt({
      sync: {
        async submit() {
          return { ...fullServerResult, review: review.slice(0, 19) };
        },
      },
      attemptSnapshot,
      previousReviewProgress,
    }),
    (error) => {
      assert.equal(error.submissionConfirmed, true);
      assert.equal(
        submissionStatus.biologySubmissionFailureMessage({
          confirmed: error.submissionConfirmed,
        }),
        "完成紀錄已保存；結果顯示失敗，請重新整理頁面。",
      );
      return true;
    },
  );
});
