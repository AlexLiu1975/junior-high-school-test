import assert from "node:assert/strict";
import test from "node:test";
import { biologyQuizAdapter } from "../src/quizzes/01-biology/biologyQuizAdapter.js";
import { QUIZ_DEFINITION } from "../functions/shared/quizzes/01-biology/biologyDefinition.js";

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

const fullServerResult = {
  resultType: "score",
  score: 90,
  correctCount: 18,
  wrongCount: 2,
  reviewAvailable: true,
  review: QUIZ_DEFINITION.questions.map((question) => ({
    questionId: question.id,
    correctOptionId: question.options.find(({ correct }) => correct).id,
    explanation: question.explanation,
  })),
};
const correctAnswers = Object.fromEntries(
  fullServerResult.review.map(({ questionId, correctOptionId }) => [questionId, correctOptionId]),
);
const twoWrongAnswers = {
  ...correctAnswers,
  q20: "q20-o3",
};
delete twoWrongAnswers.q19;

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
  const rawResult = { ...fullServerResult, ignored: "server transport detail" };
  const normalized = biologyQuizAdapter.renderResult(rawResult);

  assert.deepEqual(normalized, {
    resultType: "score",
    score: 90,
    correctCount: 18,
    wrongCount: 2,
    reviewAvailable: true,
    review: fullServerResult.review,
  });
  assert.equal(
    biologyQuizAdapter.updateReviewProgress({
      previous: {},
      result: normalized,
      attempt: {
        ...biologyQuizAdapter.restoreAttempt(savedAttempt),
        answers: twoWrongAnswers,
      },
      today: new Date(2026, 7, 15),
    }).q1.lastResult,
    "correct",
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
      answers: twoWrongAnswers,
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
    result: fullServerResult,
  });

  assert.equal(recovered.attempt.answers.q20, "q20-o3");
  assert.equal(recovered.attempt.currentQuestionIndex, savedAttempt.currentQuestionIndex);
  assert.equal(recovered.reviewProgress.q20.errorCount, 3);
  assert.equal(recovered.result.review.length, 20);
});

test("biology builds all review rows in immutable attempt order", () => {
  const restored = biologyQuizAdapter.restoreAttempt(savedAttempt);
  const attempt = {
    ...restored,
    answers: twoWrongAnswers,
  };
  const normalized = biologyQuizAdapter.renderResult(fullServerResult);
  const rows = biologyQuizAdapter.buildAnswerReviewDisplay({ attempt, result: normalized });

  assert.equal(rows.length, 20);
  assert.deepEqual(rows.map(({ id }) => id), attempt.questions.map(({ id }) => id));
  assert.deepEqual(rows[0], {
    id: "q20",
    attemptPosition: 1,
    text: attempt.questions[0].text,
    isCorrect: false,
    selectedAnswer: {
      letter: "B",
      text: attempt.questions[0].options[1].text,
    },
    correctAnswer: {
      letter: "A",
      text: attempt.questions[0].options[0].text,
    },
    explanation: fullServerResult.review.find(({ questionId }) => questionId === "q20").explanation,
  });
  assert.equal(rows[1].selectedAnswer, null);
  assert.equal(rows[1].isCorrect, false);
  assert.equal(rows[2].isCorrect, true);
  assert.match(rows[0].explanation, /\S/);
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
  const validReview = fullServerResult.review;
  for (const review of [
    validReview.slice(0, 19),
    [...validReview.slice(0, 19), { ...validReview[0] }],
    validReview.map((item, index) => index === 0
      ? { ...item, correctOptionId: "q2-o1" }
      : item),
    validReview.map((item, index) => index === 0
      ? { ...item, extra: true }
      : item),
    validReview.map((item, index) => index === 0
      ? { ...item, explanation: "   " }
      : item),
  ]) {
    assert.throws(() => biologyQuizAdapter.renderResult({
      ...fullServerResult,
      review,
    }), /invalid-biology-result/);
  }
});

test("biology preserves review progress for legacy score-only recovery", () => {
  const previous = {
    q20: {
      errorCount: 2,
      stage: 0,
      lastResult: "wrong",
      lastAttempt: "2026/08/08",
      nextReview: "2026/08/09",
    },
  };
  const legacyResult = {
    resultType: "score",
    score: 95,
    correctCount: 19,
    wrongCount: 1,
    wrongIds: ["q14"],
    reviewAvailable: false,
  };
  const normalized = biologyQuizAdapter.renderResult(legacyResult);

  assert.deepEqual(normalized, {
    resultType: "score",
    score: 95,
    correctCount: 19,
    wrongCount: 1,
    reviewAvailable: false,
  });
  assert.deepEqual(biologyQuizAdapter.buildAnswerReviewDisplay({
    attempt: biologyQuizAdapter.restoreAttempt(savedAttempt),
    result: normalized,
  }), []);

  const recovered = biologyQuizAdapter.restoreConfirmedSubmission({
    currentAttempt: biologyQuizAdapter.restoreAttempt(savedAttempt),
    submission: {
      ...savedAttempt,
      reviewProgress: previous,
    },
    result: legacyResult,
  });

  assert.deepEqual(recovered.reviewProgress, previous);
  assert.notEqual(recovered.reviewProgress, previous);
  assert.notEqual(recovered.reviewProgress.q20, previous.q20);
  assert.deepEqual(previous, {
    q20: {
      errorCount: 2,
      stage: 0,
      lastResult: "wrong",
      lastAttempt: "2026/08/08",
      nextReview: "2026/08/09",
    },
  });
});
