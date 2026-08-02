import assert from "node:assert/strict";
import test from "node:test";
import {
  QUIZ_DEFINITION,
  QUIZ_ID,
  QUIZ_VERSION,
  getQuizDefinition,
} from "../functions/shared/quizDefinition.js";
import {
  validateAndScoreSubmission,
} from "../functions/shared/quizSubmissionDomain.js";

function validSubmission() {
  return {
    quizId: QUIZ_ID,
    quizVersion: QUIZ_VERSION,
    questionOrder: QUIZ_DEFINITION.questions.map(({ id }) => id),
    optionOrder: Object.fromEntries(
      QUIZ_DEFINITION.questions.map((question) => [
        question.id,
        question.options.map((option) => option.id),
      ]),
    ),
    answers: Object.fromEntries(
      QUIZ_DEFINITION.questions.map((question) => [
        question.id,
        question.options.find((option) => option.correct).id,
      ]),
    ),
  };
}

test("exposes the current definition only for its stable ID and version", () => {
  assert.equal(getQuizDefinition(QUIZ_ID, QUIZ_VERSION), QUIZ_DEFINITION);
  assert.equal(getQuizDefinition("other-quiz", QUIZ_VERSION), null);
  assert.equal(getQuizDefinition(QUIZ_ID, QUIZ_VERSION + 1), null);
});

test("server scoring ignores caller supplied score and uses stable option IDs", () => {
  const result = validateAndScoreSubmission({
    ...validSubmission(),
    score: 0,
  });

  assert.deepEqual(result, {
    correctCount: QUIZ_DEFINITION.questions.length,
    wrongCount: 0,
    score: 100,
    wrongIds: [],
  });
});

test("unknown question and option IDs are rejected", () => {
  assert.throws(
    () => validateAndScoreSubmission({
      quizId: QUIZ_ID,
      quizVersion: QUIZ_VERSION,
      questionOrder: ["not-a-question"],
      optionOrder: { "not-a-question": ["not-an-option"] },
      answers: { "not-a-question": "not-an-option" },
    }),
    /invalid-submission/,
  );
});

test("null and array payloads use the stable validation error", () => {
  for (const payload of [null, []]) {
    assert.throws(
      () => validateAndScoreSubmission(payload),
      /invalid-submission/,
    );
  }
});

test("submission must include every question, option, and exactly one legal answer", () => {
  const missingQuestion = validSubmission();
  missingQuestion.questionOrder.pop();
  assert.throws(() => validateAndScoreSubmission(missingQuestion), /invalid-submission/);

  const missingOption = validSubmission();
  missingOption.optionOrder.q1.pop();
  assert.throws(() => validateAndScoreSubmission(missingOption), /invalid-submission/);

  const invalidAnswer = validSubmission();
  invalidAnswer.answers.q1 = "q1-o99";
  assert.throws(() => validateAndScoreSubmission(invalidAnswer), /invalid-submission/);
});
