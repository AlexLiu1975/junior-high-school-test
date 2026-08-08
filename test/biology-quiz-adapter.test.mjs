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
});

test("biology uses only the server-confirmed score result", () => {
  assert.deepEqual(
    biologyQuizAdapter.renderResult({
      resultType: "score",
      score: 85,
      correctCount: 17,
      wrongCount: 3,
      ignored: "server transport detail",
    }),
    { score: 85, correctCount: 17, wrongCount: 3 },
  );
  assert.throws(
    () => biologyQuizAdapter.renderResult({ score: 100, correctCount: 20, wrongCount: 0 }),
    /invalid-biology-result/,
  );
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
