import assert from "node:assert/strict";
import test from "node:test";
import { ENGLISH_REVIEW_2 } from "../functions/shared/englishReview2Definition.js";
import { scoreEnglishReview2 } from "../functions/shared/englishReview2Scoring.js";

test("English Review 2 preserves forty questions and the original weighting", () => {
  assert.equal(ENGLISH_REVIEW_2.id, "english-review-2");
  assert.equal(ENGLISH_REVIEW_2.questions.length, 40);
  assert.equal(new Set(ENGLISH_REVIEW_2.questions.map((q) => q.id)).size, 40);
  assert.equal(ENGLISH_REVIEW_2.questions.slice(0, 20).reduce((n, q) => n + q.points, 0), 40);
  assert.equal(ENGLISH_REVIEW_2.questions.slice(20).reduce((n, q) => n + q.points, 0), 60);
});

test("the server-owned English answer key scores one hundred", () => {
  const answers = Object.fromEntries(
    ENGLISH_REVIEW_2.questions.map((q) => [q.id, q.options.find((o) => o.correct).id]),
  );
  assert.deepEqual(scoreEnglishReview2({ answers }), {
    resultType: "score", score: 100, correctCount: 40, wrongCount: 0, wrongIds: [],
  });
});

test("English Review 2 keeps all five reading blocks attached to their questions", () => {
  assert.deepEqual(Object.keys(ENGLISH_REVIEW_2.readings), ["r1", "r2", "r3", "r4", "r5"]);
  assert.equal(ENGLISH_REVIEW_2.questions.filter((q) => q.readingId === "r1").length, 5);
  assert.equal(ENGLISH_REVIEW_2.questions.filter((q) => q.readingId === "r2").length, 5);
  assert.equal(ENGLISH_REVIEW_2.questions.filter((q) => q.readingId === "r3").length, 3);
  assert.equal(ENGLISH_REVIEW_2.questions.filter((q) => q.readingId === "r4").length, 3);
  assert.equal(ENGLISH_REVIEW_2.questions.filter((q) => q.readingId === "r5").length, 4);
});

test("question thirty-six selects the controlled library layout figure", () => {
  assert.equal(
    ENGLISH_REVIEW_2.questions.find((q) => q.id === "e36").figureId,
    "library-layout-q36",
  );
});

test("every English question has four distinct options and one answer", () => {
  for (const question of ENGLISH_REVIEW_2.questions) {
    assert.equal(question.options.length, 4, question.id);
    assert.equal(new Set(question.options.map((option) => option.id)).size, 4, question.id);
    assert.equal(question.options.filter((option) => option.correct).length, 1, question.id);
  }
});

test("unknown answer IDs reject while omitted answers count wrong", () => {
  assert.throws(
    () => scoreEnglishReview2({ answers: { e01: "e01-o99" } }),
    /invalid-submission/,
  );
  assert.throws(
    () => scoreEnglishReview2({ answers: { e99: "e99-o1" } }),
    /invalid-submission/,
  );
  assert.deepEqual(scoreEnglishReview2({ answers: {} }), {
    resultType: "score",
    score: 0,
    correctCount: 0,
    wrongCount: 40,
    wrongIds: ENGLISH_REVIEW_2.questions.map((question) => question.id),
  });
});
