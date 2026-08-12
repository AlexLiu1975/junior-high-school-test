import assert from "node:assert/strict";
import test from "node:test";
import { biologyQuizAdapter } from "../src/biologyQuizAdapter.js";
import { QUIZ_DEFINITION } from "../functions/shared/biologyDefinition.js";

const questionOrder = QUIZ_DEFINITION.questions.map(({ id }) => id).reverse();
const optionOrder = Object.fromEntries(
  QUIZ_DEFINITION.questions.map((question) => [
    question.id,
    question.options.map(({ id }) => id).reverse(),
  ]),
);
const savedAttempt = {
  attemptId: "biology-saved-1",
  questionOrder,
  optionOrder,
  answers: { q20: "q20-o4" },
  currentQuestionIndex: 3,
};

test("biology restores exact shuffled question and option order", () => {
  const restored = biologyQuizAdapter.restoreAttempt(savedAttempt);

  assert.deepEqual(restored.questionOrder, savedAttempt.questionOrder);
  assert.deepEqual(restored.optionOrder, savedAttempt.optionOrder);
  assert.deepEqual(
    restored.questions.map(({ id }) => id),
    questionOrder,
  );
  assert.deepEqual(
    restored.questions[0].options.map(({ id }) => id),
    optionOrder[questionOrder[0]],
  );
  assert.notEqual(restored.questionOrder, savedAttempt.questionOrder);
  assert.notEqual(restored.optionOrder, savedAttempt.optionOrder);
});

test("biology serializes only the server progress contract", () => {
  const serialized = biologyQuizAdapter.serializeProgress({
    ...biologyQuizAdapter.restoreAttempt(savedAttempt),
    reviewProgress: {
      q20: {
        errorCount: 1,
        stage: 0,
        lastResult: "wrong",
        lastAttempt: "2026/08/08",
        nextReview: "2026/08/09",
      },
    },
    transientMessage: "must-not-leak",
  });

  assert.deepEqual(serialized, {
    activeAttempt: savedAttempt,
    reviewProgress: {
      q20: {
        errorCount: 1,
        stage: 0,
        lastResult: "wrong",
        lastAttempt: "2026/08/08",
        nextReview: "2026/08/09",
      },
    },
  });
});

test("biology builds a complete submission without client score or identity", () => {
  const state = {
    ...biologyQuizAdapter.restoreAttempt(savedAttempt),
    reviewProgress: {},
  };

  assert.deepEqual(biologyQuizAdapter.buildSubmission(state), {
    attemptId: savedAttempt.attemptId,
    questionOrder,
    optionOrder,
    answers: savedAttempt.answers,
    reviewProgress: {},
  });

  const submission = biologyQuizAdapter.buildSubmission(state);
  state.answers.q20 = "q20-o1";
  state.optionOrder.q20.reverse();
  assert.equal(submission.answers.q20, "q20-o4");
  assert.deepEqual(submission.optionOrder.q20, optionOrder.q20);
});

test("biology malformed saved orders always use the stable restore error", () => {
  for (const malformed of [
    {},
    { ...savedAttempt, questionOrder: null },
    { ...savedAttempt, optionOrder: null },
    { ...savedAttempt, optionOrder: { ...savedAttempt.optionOrder, q20: null } },
  ]) {
    assert.throws(
      () => biologyQuizAdapter.restoreAttempt(malformed),
      (error) => error instanceof Error && error.message === "invalid-biology-attempt",
    );
  }
});

test("biology uses only the server-confirmed score result", () => {
  assert.deepEqual(
    biologyQuizAdapter.renderResult({
      resultType: "score",
      score: 85,
      correctCount: 17,
      wrongCount: 3,
      review: [
        { questionId: "q1", correctOptionId: "q1-o3" },
        { questionId: "q2", correctOptionId: "q2-o3" },
        { questionId: "q3", correctOptionId: "q3-o1" },
      ],
      ignored: "server transport detail",
    }),
    {
      score: 85,
      correctCount: 17,
      wrongCount: 3,
      review: [
        { questionId: "q1", correctOptionId: "q1-o3" },
        { questionId: "q2", correctOptionId: "q2-o3" },
        { questionId: "q3", correctOptionId: "q3-o1" },
      ],
    },
  );
  assert.throws(
    () => biologyQuizAdapter.renderResult({ score: 100, correctCount: 20, wrongCount: 0 }),
    /invalid-biology-result/,
  );
});

test("biology converts an online-recovered submission into the confirmed result state", () => {
  const currentAttempt = biologyQuizAdapter.restoreAttempt(savedAttempt);
  const recovered = biologyQuizAdapter.restoreConfirmedSubmission({
    currentAttempt,
    submission: {
      ...biologyQuizAdapter.buildSubmission({ ...currentAttempt, reviewProgress: {} }),
      answers: { ...currentAttempt.answers, q20: "q20-o1" },
      reviewProgress: {
        q20: {
          errorCount: 2,
          stage: 0,
          lastResult: "wrong",
          lastAttempt: "2026/08/08",
          nextReview: "2026/08/09",
        },
      },
    },
    result: {
      resultType: "score",
      score: 80,
      correctCount: 16,
      wrongCount: 4,
      review: [
        { questionId: "q1", correctOptionId: "q1-o3" },
        { questionId: "q2", correctOptionId: "q2-o3" },
        { questionId: "q3", correctOptionId: "q3-o1" },
        { questionId: "q20", correctOptionId: "q20-o4" },
      ],
    },
  });

  assert.equal(recovered.attempt.answers.q20, "q20-o1");
  assert.equal(recovered.attempt.currentQuestionIndex, savedAttempt.currentQuestionIndex);
  assert.equal(recovered.reviewProgress.q20.errorCount, 3);
  assert.equal(recovered.result.review.length, 4);
});

test("biology creates a new attempt with stable serializable orders", () => {
  const first = biologyQuizAdapter.createAttempt({ random: () => 0, attemptId: "attempt-a" });
  const second = biologyQuizAdapter.createAttempt({ random: () => 0.999999, attemptId: "attempt-b" });

  assert.equal(first.attemptId, "attempt-a");
  assert.equal(second.attemptId, "attempt-b");
  assert.notDeepEqual(first.questionOrder, second.questionOrder);
  assert.equal(Object.keys(first.optionOrder).length, QUIZ_DEFINITION.questions.length);
  assert.deepEqual(first.answers, {});
  assert.equal(first.currentQuestionIndex, 0);
});

test("biology rejects malformed or caller-shaped review payloads with one stable error", () => {
  for (const review of [
    [null],
    [{ questionId: "q1", correctOptionId: "q1-o3", explanation: "not allowed" }],
    [{ questionId: "q1", correctOptionId: "q2-o1" }],
  ]) {
    assert.throws(() => biologyQuizAdapter.renderResult({
      resultType: "score",
      score: 95,
      correctCount: 19,
      wrongCount: 1,
      review,
    }), /invalid-biology-result/);
  }
});
