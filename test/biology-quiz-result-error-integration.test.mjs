import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { createServer } from "vite";
import { QUIZ_DEFINITION } from "../functions/shared/biologyDefinition.js";
import { biologyQuizAdapter } from "../src/biologyQuizAdapter.js";
import {
  finishBiologyQuizSubmission,
  recoverBiologyQuizSubmission,
} from "../src/biologyQuizOrchestration.js";
import { createQuizAttemptLifecycle } from "../src/quizAttemptLifecycle.js";

const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true },
});
const biologyQuizModule = await vite.ssrLoadModule("/src/BiologyQuiz.jsx");
await vite.close();

const questionOrder = QUIZ_DEFINITION.questions.map(({ id }) => id).reverse();
const optionOrder = Object.fromEntries(
  QUIZ_DEFINITION.questions.map((question) => [
    question.id,
    question.options.map(({ id }) => id).reverse(),
  ]),
);
const currentAttempt = biologyQuizAdapter.restoreAttempt({
  attemptId: "biology-result-error-integration-1",
  questionOrder,
  optionOrder,
  answers: {},
  currentQuestionIndex: 19,
});
const fullReview = QUIZ_DEFINITION.questions.map((question) => ({
  questionId: question.id,
  correctOptionId: question.options.find(({ correct }) => correct).id,
  explanation: question.explanation,
}));
const malformedResult = {
  resultType: "score",
  score: 0,
  correctCount: 0,
  wrongCount: 20,
  reviewAvailable: true,
  review: fullReview.slice(0, 19),
};
const expectedMessage = "完成紀錄已保存，但解析暫時無法顯示，請重新整理頁面。";

function assertAlertMarkup(message) {
  const markup = renderToStaticMarkup(React.createElement(
    biologyQuizModule.BiologySaveError,
    { message, RED: "#B23A2E" },
  ));
  assert.match(markup, /role="alert"/);
  assert.match(markup, /完成紀錄已保存，但解析暫時無法顯示，請重新整理頁面。/);
}

test("BiologyQuiz direct malformed review catch renders the confirmed explanation alert", async () => {
  assert.equal(typeof finishBiologyQuizSubmission, "function");
  const lifecycle = createQuizAttemptLifecycle();
  const events = [];
  let saveError;

  await finishBiologyQuizSubmission({
    lifecycle,
    attempt: currentAttempt,
    reviewProgress: {},
    saveAttempt() {
      events.push("save-attempt");
    },
    sync: {
      async flush() {
        events.push("flush");
      },
      async submit() {
        events.push("submit");
        return malformedResult;
      },
      queueSave() {
        events.push("queue-complete");
      },
    },
    setAttempt() {
      events.push("set-attempt");
    },
    setReviewProgress() {
      events.push("set-review-progress");
    },
    setConfirmedResult() {
      events.push("set-result");
    },
    setView() {
      events.push("set-view");
    },
    setSaveError(message) {
      saveError = message;
      events.push(message === null ? "clear-error" : "set-error");
    },
    setFinishing(value) {
      events.push(value ? "finishing" : "finished");
    },
    reportError() {},
  });

  assert.equal(saveError, expectedMessage);
  assert.deepEqual(events, [
    "finishing",
    "clear-error",
    "save-attempt",
    "flush",
    "submit",
    "set-error",
    "finished",
  ]);
  assert.equal(lifecycle.claimStart(), true);
  lifecycle.releaseStart();
  assertAlertMarkup(saveError);
});

test("BiologyQuiz recovered malformed review catch renders the confirmed explanation alert", () => {
  assert.equal(typeof recoverBiologyQuizSubmission, "function");
  const lifecycle = createQuizAttemptLifecycle();
  const submission = {
    ...biologyQuizAdapter.buildSubmission({ ...currentAttempt, reviewProgress: {} }),
    reviewProgress: {},
  };
  const calls = [];
  let saveError;

  recoverBiologyQuizSubmission({
    lifecycle,
    attempt: currentAttempt,
    sync: {
      queueSave() {
        calls.push("queue-save");
      },
    },
    recoveredSubmission: { result: malformedResult, submission, refreshRequired: false },
    setAttempt() {
      calls.push("set-attempt");
    },
    setReviewProgress() {
      calls.push("set-review-progress");
    },
    setConfirmedResult() {
      calls.push("set-result");
    },
    setView() {
      calls.push("set-view");
    },
    setSaveError(message) {
      saveError = message;
      calls.push("set-error");
    },
    reportError() {},
  });

  assert.equal(saveError, expectedMessage);
  assert.deepEqual(calls, ["set-error"]);
  assertAlertMarkup(saveError);
});
