import assert from "node:assert/strict";
import test from "node:test";

import { getQuizDefinition, validateQuizSubmission } from "../functions/shared/quizRegistry.js";

const PAPERS = [
  { id: "physics-chemistry-b3-1-1-to-2-1-part-1", count: 40, points: 2.5 },
  { id: "physics-chemistry-b3-1-1-to-2-1-part-2", count: 25, points: 4 },
];

function identityOrder(definition) {
  return {
    questionOrder: definition.questions.map(({ id }) => id),
    optionOrder: Object.fromEntries(
      definition.questions.map((question) => [question.id, question.options.map(({ id }) => id)]),
    ),
  };
}

for (const paper of PAPERS) {
  test(`${paper.id}: structure, points and answer key are well-formed`, () => {
    const definition = getQuizDefinition(paper.id, 1);
    assert.ok(definition, "definition is registered");
    assert.equal(definition.kind, "multiple-choice");
    assert.equal(definition.orderingPolicy, "canonical");
    assert.equal(definition.resultReviewScope, "all");
    assert.equal(definition.subject, "PhysicsChemistry");
    assert.equal(definition.questions.length, paper.count);

    const ids = new Set();
    let totalPoints = 0;
    for (const question of definition.questions) {
      assert.equal(ids.has(question.id), false, `duplicate question id ${question.id}`);
      ids.add(question.id);
      assert.equal(question.points, paper.points);
      totalPoints += question.points;
      assert.equal(question.options.length, 4);
      assert.equal(new Set(question.options.map(({ id }) => id)).size, 4);
      assert.equal(question.options.filter(({ correct }) => correct === true).length, 1);
      assert.equal(typeof question.explanation, "string");
      assert.ok(question.explanation.trim().length > 0, `${question.id} missing explanation`);
      assert.ok(typeof question.text === "string" && question.text.trim().length > 0);
    }
    assert.equal(totalPoints, 100);
  });

  test(`${paper.id}: scores 100 for all-correct and 0 for all-wrong`, () => {
    const definition = getQuizDefinition(paper.id, 1);
    const order = identityOrder(definition);

    const allCorrect = Object.fromEntries(
      definition.questions.map((question) => [
        question.id,
        question.options.find(({ correct }) => correct).id,
      ]),
    );
    assert.deepEqual(validateQuizSubmission(definition, { ...order, answers: allCorrect }), {
      resultType: "score",
      score: 100,
      correctCount: paper.count,
      wrongCount: 0,
      wrongIds: [],
    });

    const allWrong = Object.fromEntries(
      definition.questions.map((question) => [
        question.id,
        question.options.find(({ correct }) => !correct).id,
      ]),
    );
    const wrongResult = validateQuizSubmission(definition, { ...order, answers: allWrong });
    assert.equal(wrongResult.score, 0);
    assert.equal(wrongResult.correctCount, 0);
    assert.equal(wrongResult.wrongCount, paper.count);
  });

  test(`${paper.id}: rejects a non-permutation order`, () => {
    const definition = getQuizDefinition(paper.id, 1);
    const order = identityOrder(definition);
    assert.throws(
      () => validateQuizSubmission(definition, {
        ...order,
        questionOrder: order.questionOrder.slice(1),
        answers: {},
      }),
      /invalid-submission/,
    );
  });
}
