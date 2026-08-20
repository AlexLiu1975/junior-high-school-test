import assert from "node:assert/strict";
import test from "node:test";
import {
  QUIZ_CATALOG,
  getQuizDefinition,
  validateQuizSubmission,
} from "../functions/shared/quizRegistry.js";

function canonicalMultipleChoiceOrder(definition) {
  return {
    questionOrder: definition.questions.map(({ id }) => id),
    optionOrder: Object.fromEntries(definition.questions.map((question) => [
      question.id,
      question.options.map(({ id }) => id),
    ])),
  };
}

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
  assert.equal(QUIZ_CATALOG.find(({ id }) => id === "biology-cell-microscope-1").version, 2);
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

test("Biology retains its legacy definition while the catalog exposes version 2", () => {
  const current = getQuizDefinition("biology-cell-microscope-1", 2);
  const legacy = getQuizDefinition("biology-cell-microscope-1", 1);

  assert.equal(QUIZ_CATALOG.filter(({ id }) => id === current.id).length, 1);
  assert.equal(QUIZ_CATALOG.find(({ id }) => id === current.id).version, 2);
  assert.equal(current.resultReviewScope, "all");
  assert.equal(legacy.resultReviewScope, "legacy-score");
  assert.equal(legacy.questions[13].options[0].text, "最大的放大倍率：甲＜乙");
  assert.equal(legacy.questions[13].options[2].correct, true);
});

test("catalog metadata and trusted definitions are deeply immutable", () => {
  assert.equal(Object.isFrozen(QUIZ_CATALOG), true);
  for (const catalogQuiz of QUIZ_CATALOG) {
    assert.equal(Object.isFrozen(catalogQuiz), true);
    const definition = getQuizDefinition(catalogQuiz.id, catalogQuiz.version);
    assert.equal(Object.isFrozen(definition), true);

    const originalKind = definition.kind;
    try {
      assert.throws(() => {
        definition.kind = "tampered";
      }, TypeError);
    } finally {
      if (definition.kind !== originalKind) definition.kind = originalKind;
    }

    if (definition.questions) {
      const questions = definition.questions;
      const originalLength = questions.length;
      const firstQuestion = questions[0];
      const firstOption = firstQuestion.options[0];
      const originalCorrect = firstOption.correct;
      assert.equal(Object.isFrozen(questions), true);
      assert.equal(Object.isFrozen(firstQuestion), true);
      assert.equal(Object.isFrozen(firstQuestion.options), true);
      assert.equal(Object.isFrozen(firstOption), true);
      try {
        assert.throws(() => questions.push(firstQuestion), TypeError);
      } finally {
        if (questions.length !== originalLength) questions.length = originalLength;
      }
      try {
        assert.throws(() => {
          firstOption.correct = !originalCorrect;
        }, TypeError);
      } finally {
        if (firstOption.correct !== originalCorrect) firstOption.correct = originalCorrect;
      }
    }

    if (definition.elements) {
      assert.equal(Object.isFrozen(definition.elements), true);
      assert.equal(Object.isFrozen(definition.elements[0]), true);
    }
    assert.equal(getQuizDefinition(catalogQuiz.id, catalogQuiz.version).kind, originalKind);
  }
});

test("multiple-choice submissions count missing answers wrong and reject unknown IDs", () => {
  const definition = getQuizDefinition("english-review-2", 1);
  const order = canonicalMultipleChoiceOrder(definition);
  const firstQuestion = definition.questions[0];
  const correctAnswer = firstQuestion.options.find(({ correct }) => correct).id;

  assert.deepEqual(validateQuizSubmission(definition, {
    ...order,
    answers: { [firstQuestion.id]: correctAnswer },
  }), {
    resultType: "score",
    score: 2,
    correctCount: 1,
    wrongCount: 39,
    wrongIds: definition.questions.slice(1).map(({ id }) => id),
  });
  assert.throws(
    () => validateQuizSubmission(definition, {
      ...order,
      answers: { unknown: correctAnswer },
    }),
    /invalid-submission/,
  );
  assert.throws(
    () => validateQuizSubmission(definition, {
      ...order,
      answers: { [firstQuestion.id]: "not-an-option" },
    }),
    /invalid-submission/,
  );
});

test("English submissions require canonical question and option order", () => {
  const definition = getQuizDefinition("english-review-2", 1);
  const order = canonicalMultipleChoiceOrder(definition);
  assert.throws(
    () => validateQuizSubmission(definition, { answers: {} }),
    /invalid-submission/,
  );
  assert.throws(
    () => validateQuizSubmission(definition, {
      ...order,
      questionOrder: [...order.questionOrder].reverse(),
      answers: {},
    }),
    /invalid-submission/,
  );
  assert.throws(
    () => validateQuizSubmission(definition, {
      ...order,
      optionOrder: {
        ...order.optionOrder,
        [order.questionOrder[0]]: [...order.optionOrder[order.questionOrder[0]]].reverse(),
      },
      answers: {},
    }),
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

test("placement dispatcher validates against the supplied definition identity", () => {
  const synthetic = {
    id: "synthetic-placement-2",
    version: 7,
    kind: "placement",
    elements: [
      { id: "token-x", targetId: "slot-x" },
      { id: "token-y", targetId: "slot-y" },
    ],
  };
  const submission = {
    placements: { "token-x": "slot-x", "token-y": "slot-y" },
    errorCount: 2,
    durationSeconds: 3,
  };
  assert.deepEqual(validateQuizSubmission(synthetic, submission), {
    resultType: "placement",
    completedCount: 2,
    totalItems: 2,
    errorCount: 2,
    durationSeconds: 3,
    completed: true,
  });
  assert.throws(() => validateQuizSubmission(
    { ...synthetic, id: "synthetic-placement-other", elements: [{ id: "other", targetId: "other-slot" }] },
    submission,
  ), /invalid-submission/);
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
