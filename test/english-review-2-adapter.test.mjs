import assert from "node:assert/strict";
import test from "node:test";
import { englishReview2Adapter } from "../src/quizzes/02-english/englishReview2Adapter.js";

const savedAttempt = {
  attemptId: "english-saved-1",
  answers: { e01: "e01-o3" },
  lastAnsweredId: "e01",
};

test("English progress preserves answers and last answered question", () => {
  const saved = englishReview2Adapter.serializeProgress(savedAttempt);
  const restored = englishReview2Adapter.restoreAttempt(saved.activeAttempt);

  assert.deepEqual(saved.activeAttempt.answers, { e01: "e01-o3" });
  assert.equal(saved.activeAttempt.currentQuestionIndex, 0);
  assert.equal(Object.hasOwn(saved.activeAttempt, "lastAnsweredId"), false);
  assert.equal(restored.lastAnsweredId, "e01");
});

test("submission reports the exact unanswered count before confirmation", () => {
  assert.equal(englishReview2Adapter.getUnansweredCount({ e01: "e01-o3" }), 39);
  assert.equal(englishReview2Adapter.getUnansweredCount({}), 40);
});

test("English restore rejects unknown questions and options", () => {
  for (const malformed of [
    { ...savedAttempt, answers: { e99: "e99-o1" } },
    { ...savedAttempt, answers: { e01: "e01-o99" } },
    { ...savedAttempt, lastAnsweredId: "e99" },
  ]) {
    assert.throws(
      () => englishReview2Adapter.restoreAttempt(malformed),
      /invalid-english-attempt/,
    );
  }
});

test("English submission contains the canonical answer state without caller score", () => {
  const submission = englishReview2Adapter.buildSubmission({
    ...savedAttempt,
    score: 100,
    studentName: "must-not-leak",
  });

  assert.equal(submission.attemptId, "english-saved-1");
  assert.deepEqual(submission.answers, { e01: "e01-o3" });
  assert.equal(submission.questionOrder.length, 40);
  assert.equal(Object.keys(submission.optionOrder).length, 40);
  assert.equal(Object.hasOwn(submission, "score"), false);
  assert.equal(Object.hasOwn(submission, "studentName"), false);
});

test("English result accepts only a server-confirmed score and valid wrong IDs", () => {
  assert.deepEqual(englishReview2Adapter.renderResult({
    resultType: "score",
    score: 97,
    correctCount: 39,
    wrongCount: 1,
    wrongIds: ["e02"],
    review: [{ questionId: "e02", correctOptionId: "e02-o2", explanation: "server review" }],
    ignored: "transport detail",
  }), {
    score: 97,
    correctCount: 39,
    wrongCount: 1,
    wrongIds: ["e02"],
    review: [{ questionId: "e02", correctOptionId: "e02-o2", explanation: "server review" }],
  });

  for (const wrongIds of [undefined, ["e99"], ["e02", "e02"], ["e02", "e03"]]) {
    assert.throws(
      () => englishReview2Adapter.renderResult({
        resultType: "score",
        score: 97,
        correctCount: 39,
        wrongCount: 1,
        wrongIds,
        review: [{ questionId: "e02", correctOptionId: "e02-o2", explanation: "server review" }],
      }),
      /invalid-english-result/,
    );
  }
});

test("English safely renders a pre-wrongIds retry without inventing question review", () => {
  assert.deepEqual(englishReview2Adapter.renderResult({
    resultType: "score",
    score: 95,
    correctCount: 38,
    wrongCount: 2,
  }), {
    score: 95,
    correctCount: 38,
    wrongCount: 2,
    wrongIds: null,
    reviewAvailable: false,
  });
});

test("online recovery restores the submitted answers and trusted result", () => {
  const recovered = englishReview2Adapter.restoreConfirmedSubmission({
    currentAttempt: savedAttempt,
    submission: {
      attemptId: "english-saved-1",
      answers: { e01: "e01-o3", e02: "e02-o1" },
    },
    result: {
      resultType: "score",
      score: 95,
      correctCount: 38,
      wrongCount: 2,
      wrongIds: ["e02", "e03"],
      review: [
        { questionId: "e02", correctOptionId: "e02-o2", explanation: "server review 2" },
        { questionId: "e03", correctOptionId: "e03-o2", explanation: "server review 3" },
      ],
    },
  });

  assert.deepEqual(recovered.attempt.answers, { e01: "e01-o3", e02: "e02-o1" });
  assert.equal(recovered.attempt.lastAnsweredId, "e01");
  assert.deepEqual(recovered.result.wrongIds, ["e02", "e03"]);
});

test("English rejects malformed review items with the stable result error", () => {
  for (const review of [
    [null],
    [{ questionId: "e02", correctOptionId: "e02-o2", explanation: "ok", extra: true }],
    [{ questionId: "e02", correctOptionId: "e03-o1", explanation: "wrong question" }],
  ]) {
    assert.throws(() => englishReview2Adapter.renderResult({
      resultType: "score",
      score: 97,
      correctCount: 39,
      wrongCount: 1,
      wrongIds: ["e02"],
      review,
    }), /invalid-english-result/);
  }
});
