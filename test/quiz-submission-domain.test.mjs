import assert from "node:assert/strict";
import test from "node:test";
import {
  QUIZ_DEFINITION,
  QUIZ_ID,
  QUIZ_VERSION,
} from "../functions/shared/biologyDefinition.js";
import {
  getQuizDefinition,
  validateQuizSubmission,
} from "../functions/shared/quizRegistry.js";

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
  const registered = getQuizDefinition(QUIZ_ID, QUIZ_VERSION);
  assert.notEqual(registered, QUIZ_DEFINITION);
  assert.equal(registered.id, QUIZ_DEFINITION.id);
  assert.equal(registered.version, QUIZ_DEFINITION.version);
  assert.equal(getQuizDefinition("other-quiz", QUIZ_VERSION), null);
  assert.equal(getQuizDefinition(QUIZ_ID, QUIZ_VERSION + 1), null);
});

test("server scoring ignores caller supplied score and uses stable option IDs", () => {
  const result = validateQuizSubmission(QUIZ_DEFINITION, {
    ...validSubmission(),
    score: 0,
  });

  assert.deepEqual(result, {
    resultType: "score",
    correctCount: QUIZ_DEFINITION.questions.length,
    wrongCount: 0,
    score: 100,
    wrongIds: [],
  });
});

test("unknown question and option IDs are rejected", () => {
  assert.throws(
    () => validateQuizSubmission(QUIZ_DEFINITION, {
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
      () => validateQuizSubmission(QUIZ_DEFINITION, payload),
      /invalid-submission/,
    );
  }
});

test("submission preserves legal ordering while omitted answers count wrong", () => {
  const permutedOrdering = validSubmission();
  permutedOrdering.questionOrder.reverse();
  for (const optionIds of Object.values(permutedOrdering.optionOrder)) optionIds.reverse();
  assert.equal(
    validateQuizSubmission(QUIZ_DEFINITION, permutedOrdering).score,
    100,
  );

  const missingOrdering = validSubmission();
  delete missingOrdering.questionOrder;
  delete missingOrdering.optionOrder;
  assert.throws(
    () => validateQuizSubmission(QUIZ_DEFINITION, missingOrdering),
    /invalid-submission/,
  );

  const missingQuestion = validSubmission();
  missingQuestion.questionOrder.pop();
  assert.throws(
    () => validateQuizSubmission(QUIZ_DEFINITION, missingQuestion),
    /invalid-submission/,
  );

  const missingOption = validSubmission();
  missingOption.optionOrder.q1.pop();
  assert.throws(
    () => validateQuizSubmission(QUIZ_DEFINITION, missingOption),
    /invalid-submission/,
  );

  const invalidAnswer = validSubmission();
  invalidAnswer.answers.q1 = "q1-o99";
  assert.throws(
    () => validateQuizSubmission(QUIZ_DEFINITION, invalidAnswer),
    /invalid-submission/,
  );

  const missingAnswer = validSubmission();
  delete missingAnswer.answers.q1;
  assert.deepEqual(validateQuizSubmission(QUIZ_DEFINITION, missingAnswer), {
    resultType: "score",
    correctCount: QUIZ_DEFINITION.questions.length - 1,
    wrongCount: 1,
    score: 95,
    wrongIds: ["q1"],
  });
});
