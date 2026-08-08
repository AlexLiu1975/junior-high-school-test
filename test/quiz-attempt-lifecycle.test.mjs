import assert from "node:assert/strict";
import test from "node:test";
import {
  EMPTY_QUIZ_MESSAGE,
  createQuizAttemptLifecycle,
} from "../src/quizAttemptLifecycle.js";

const questions = [
  {
    id: "q1",
    n: 1,
    text: "第一題",
    options: [
      { id: "q1-o1", text: "甲", correct: false },
      { id: "q1-o2", text: "乙", correct: true },
      { id: "q1-o3", text: "丙", correct: false },
      { id: "q1-o4", text: "丁", correct: false },
    ],
  },
  {
    id: "q2",
    n: 2,
    text: "第二題",
    options: [
      { id: "q2-o1", text: "戊", correct: false },
      { id: "q2-o2", text: "己", correct: false },
      { id: "q2-o3", text: "庚", correct: false },
      { id: "q2-o4", text: "辛", correct: true },
    ],
  },
];

const alwaysZero = () => 0;
const almostOne = () => 0.999999;

function startAttempt(lifecycle, random) {
  assert.equal(lifecycle.claimStart(), true);
  const result = lifecycle.prepareAttempt(questions, random);
  lifecycle.releaseStart();
  assert.equal(result.ok, true);
  return result.questions;
}

test("one prepared quiz stays stable while navigating within an attempt", () => {
  const lifecycle = createQuizAttemptLifecycle();
  const prepared = startAttempt(lifecycle, alwaysZero);

  assert.equal(lifecycle.move(0, 1), 1);
  assert.equal(lifecycle.questionAt(1), prepared[1]);
  assert.equal(lifecycle.move(1, -1), 0);
  assert.equal(lifecycle.questionAt(0), prepared[0]);
  assert.deepEqual(
    prepared.map(({ id }) => id),
    ["q2", "q1"],
  );
});

test("a retry creates a fresh prepared quiz", () => {
  const lifecycle = createQuizAttemptLifecycle();
  const firstAttempt = startAttempt(lifecycle, alwaysZero);
  const retryAttempt = startAttempt(lifecycle, almostOne);

  assert.notEqual(retryAttempt, firstAttempt);
  assert.deepEqual(
    firstAttempt.map(({ id }) => id),
    ["q2", "q1"],
  );
  assert.deepEqual(
    retryAttempt.map(({ id }) => id),
    ["q1", "q2"],
  );
  assert.deepEqual(
    firstAttempt[0].options.map(({ text }) => text),
    ["己", "庚", "辛", "戊"],
  );
  assert.deepEqual(
    retryAttempt[0].options.map(({ text }) => text),
    ["甲", "乙", "丙", "丁"],
  );
});

test("a restored prepared quiz keeps its saved navigation order", () => {
  const lifecycle = createQuizAttemptLifecycle();
  const prepared = startAttempt(lifecycle, alwaysZero);
  const restored = prepared.map((question) => ({
    ...question,
    options: [...question.options].reverse(),
  }));

  assert.deepEqual(lifecycle.restoreAttempt(restored), restored);
  assert.equal(lifecycle.questionAt(0).id, restored[0].id);
  assert.deepEqual(
    lifecycle.questionAt(0).options.map(({ id }) => id),
    restored[0].options.map(({ id }) => id),
  );
});

test("results map letters and text from the exact viewed attempt", () => {
  const lifecycle = createQuizAttemptLifecycle();
  startAttempt(lifecycle, alwaysZero);

  assert.deepEqual(lifecycle.resultsFor({ q1: "q1-o2", q2: "q2-o2" }), {
    correctCount: 1,
    wrongIds: ["q2"],
    wrongAnswers: [
      {
        id: "q2",
        attemptPosition: 1,
        text: "第二題",
        selectedAnswer: { letter: "A", text: "己" },
        correctAnswer: { letter: "C", text: "辛" },
      },
    ],
  });
});

test("an empty question bank returns the exact start error", () => {
  const lifecycle = createQuizAttemptLifecycle();
  assert.equal(lifecycle.claimStart(), true);
  assert.deepEqual(lifecycle.prepareAttempt([], alwaysZero), {
    ok: false,
    error: EMPTY_QUIZ_MESSAGE,
  });
  lifecycle.releaseStart();
  assert.equal(EMPTY_QUIZ_MESSAGE, "目前沒有可用的題目。");
});

test("synchronous guards make finish, retry, and clear mutually exclusive", () => {
  const lifecycle = createQuizAttemptLifecycle();

  assert.equal(lifecycle.canMutateAttempt(), true);
  assert.equal(lifecycle.claimFinish(), true);
  assert.equal(lifecycle.canMutateAttempt(), false);
  assert.equal(lifecycle.claimFinish(), false);
  assert.equal(lifecycle.claimStart(), false);
  assert.equal(lifecycle.claimClear(), false);
  lifecycle.releaseFinish();
  assert.equal(lifecycle.canMutateAttempt(), true);

  assert.equal(lifecycle.claimStart(), true);
  assert.equal(lifecycle.claimClear(), false);
  lifecycle.releaseStart();

  assert.equal(lifecycle.claimClear(), true);
  assert.equal(lifecycle.claimStart(), false);
  assert.equal(lifecycle.claimFinish(), false);
  lifecycle.releaseClear();
  assert.equal(lifecycle.claimStart(), true);
});
