import assert from "node:assert/strict";
import test from "node:test";
import {
  QUIZ_CATALOG,
  getQuizDefinition,
  validateQuizSubmission,
} from "../functions/shared/quizRegistry.js";

test("catalog exposes three stable quizzes in display order", () => {
  assert.deepEqual(QUIZ_CATALOG.map((quiz) => quiz.id), [
    "biology-cell-microscope-1",
    "english-review-2",
    "periodic-table",
  ]);
  assert.deepEqual(QUIZ_CATALOG.map(({ kind }) => kind), [
    "multiple-choice",
    "multiple-choice",
    "placement",
  ]);
  assert.equal(QUIZ_CATALOG.every(({ version, subject, title, catalogDescription }) => (
    Number.isInteger(version)
      && typeof subject === "string" && subject.length > 0
      && typeof title === "string" && title.length > 0
      && typeof catalogDescription === "string" && catalogDescription.length > 0
  )), true);
});

test("registry resolves only an exact stable quiz ID and version", () => {
  for (const catalogQuiz of QUIZ_CATALOG) {
    const definition = getQuizDefinition(catalogQuiz.id, catalogQuiz.version);
    assert.equal(definition.id, catalogQuiz.id);
    assert.equal(definition.version, catalogQuiz.version);
    assert.equal(definition.kind, catalogQuiz.kind);
    assert.equal(definition.subject, catalogQuiz.subject);
    assert.equal(definition.title, catalogQuiz.title);
  }
  assert.equal(getQuizDefinition("unknown", 1), null);
  assert.equal(getQuizDefinition("english-review-2", 999), null);
  assert.equal(getQuizDefinition("english-review-2", "1"), null);
});

test("multiple-choice submissions count missing answers wrong and reject unknown IDs", () => {
  const definition = getQuizDefinition("english-review-2", 1);
  const firstQuestion = definition.questions[0];
  const correctAnswer = firstQuestion.options.find(({ correct }) => correct).id;

  assert.deepEqual(validateQuizSubmission(definition, {
    answers: { [firstQuestion.id]: correctAnswer },
  }), {
    resultType: "score",
    score: 2,
    correctCount: 1,
    wrongCount: 39,
    wrongIds: definition.questions.slice(1).map(({ id }) => id),
  });
  assert.throws(
    () => validateQuizSubmission(definition, { answers: { unknown: correctAnswer } }),
    /invalid-submission/,
  );
  assert.throws(
    () => validateQuizSubmission(definition, { answers: { [firstQuestion.id]: "not-an-option" } }),
    /invalid-submission/,
  );
});

test("placement submissions return only placement results and reject score fields", () => {
  const definition = getQuizDefinition("periodic-table", 1);
  const submission = {
    placements: Object.fromEntries(
      definition.elements.map(({ id, targetId }) => [id, targetId]),
    ),
    errorCount: 9,
    durationSeconds: 755,
  };

  assert.deepEqual(validateQuizSubmission(definition, submission), {
    resultType: "placement",
    completedCount: 118,
    totalItems: 118,
    errorCount: 9,
    durationSeconds: 755,
    completed: true,
  });
  assert.throws(
    () => validateQuizSubmission(definition, { ...submission, score: 100 }),
    /invalid-submission/,
  );
});

test("cross-kind and unknown submission fields reject", () => {
  const english = getQuizDefinition("english-review-2", 1);
  const periodic = getQuizDefinition("periodic-table", 1);
  assert.throws(
    () => validateQuizSubmission(english, { placements: {}, answers: {} }),
    /invalid-submission/,
  );
  assert.throws(
    () => validateQuizSubmission(periodic, {
      placements: {}, errorCount: 0, durationSeconds: 0, unexpected: true,
    }),
    /invalid-submission/,
  );
});
