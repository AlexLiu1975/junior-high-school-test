import assert from "node:assert/strict";
import test from "node:test";

import { PHYSICS_CHEMISTRY_PART_1_CONTENT } from "../src/quizzes/04-physics-chemistry/b3-1-1-to-2-1-part-1/part1Content.js";
import { PHYSICS_CHEMISTRY_PART_2_CONTENT } from "../src/quizzes/04-physics-chemistry/b3-1-1-to-2-1-part-2/part2Content.js";
import { createPhysicsChemistryAdapter } from "../src/quizzes/04-physics-chemistry/physicsChemistryAdapter.js";

function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fullResult(content) {
  return {
    resultType: "score",
    score: 100,
    correctCount: content.questions.length,
    wrongCount: 0,
    reviewAvailable: true,
    review: content.questions.map((question) => ({
      questionId: question.id,
      correctOptionId: question.options[0].id,
      explanation: "說明",
    })),
  };
}

for (const content of [PHYSICS_CHEMISTRY_PART_1_CONTENT, PHYSICS_CHEMISTRY_PART_2_CONTENT]) {
  const adapter = createPhysicsChemistryAdapter(content);
  const size = content.questions.length;
  const ids = content.questions.map(({ id }) => id);

  test(`${content.id}: createAttempt yields a full permutation with empty answers`, () => {
    const attempt = adapter.createAttempt({ random: seeded(7), attemptId: "att-1" });
    assert.equal(attempt.attemptId, "att-1");
    assert.equal(attempt.questions.length, size);
    assert.deepEqual([...attempt.questionOrder].sort(), [...ids].sort());
    assert.deepEqual(attempt.answers, {});
    assert.deepEqual(attempt.reviewProgress, {});
    for (const question of content.questions) {
      const shuffled = attempt.optionOrder[question.id];
      assert.deepEqual([...shuffled].sort(), question.options.map(({ id }) => id).sort());
    }
  });

  test(`${content.id}: serialize/restore round-trips order and answers`, () => {
    const attempt = adapter.createAttempt({ random: seeded(9), attemptId: "att-2" });
    const firstQ = attempt.questionOrder[0];
    const chosen = attempt.optionOrder[firstQ][1];
    const answered = { ...attempt, answers: { [firstQ]: chosen } };
    const progress = adapter.serializeProgress(answered);
    assert.deepEqual(Object.keys(progress.activeAttempt).sort(), [
      "answers", "attemptId", "currentQuestionIndex", "optionOrder", "questionOrder",
    ]);
    assert.deepEqual(progress.reviewProgress, {});
    const restored = adapter.restoreAttempt(progress.activeAttempt);
    assert.deepEqual(restored.questionOrder, answered.questionOrder);
    assert.deepEqual(restored.optionOrder, answered.optionOrder);
    assert.deepEqual(restored.answers, { [firstQ]: chosen });
    assert.equal(restored.questions[0].id, firstQ);
  });

  test(`${content.id}: buildSubmission carries only submission fields`, () => {
    const attempt = adapter.createAttempt({ random: seeded(3), attemptId: "att-3" });
    const submission = adapter.buildSubmission(attempt);
    assert.deepEqual(Object.keys(submission).sort(), [
      "answers", "attemptId", "optionOrder", "questionOrder", "reviewProgress",
    ]);
    assert.equal(submission.attemptId, "att-3");
  });

  test(`${content.id}: getUnansweredCount tracks remaining questions`, () => {
    assert.equal(adapter.getUnansweredCount({}), size);
    assert.equal(adapter.getUnansweredCount({ [ids[0]]: "x" }), size - 1);
  });

  test(`${content.id}: renderResult validates a full review and rejects malformed`, () => {
    const rendered = adapter.renderResult(fullResult(content));
    assert.equal(rendered.score, 100);
    assert.equal(rendered.review.length, size);
    assert.throws(() => adapter.renderResult({ ...fullResult(content), review: [] }), /invalid-physics-chemistry-result/);
    assert.throws(() => adapter.renderResult({ ...fullResult(content), reviewAvailable: false }), /invalid-physics-chemistry-result/);
  });

  test(`${content.id}: buildAnswerReviewDisplay marks correct and wrong per question`, () => {
    const attempt = adapter.createAttempt({ random: seeded(5), attemptId: "att-4" });
    const result = fullResult(content); // correctOptionId === each question's content options[0]
    // Answer every question with the option the result marks correct → all correct.
    const answers = Object.fromEntries(content.questions.map((q) => [q.id, q.options[0].id]));
    const rows = adapter.buildAnswerReviewDisplay({ attempt: { ...attempt, answers }, result });
    assert.equal(rows.length, size);
    assert.ok(rows.every((row) => row.options.length === 4));
    assert.ok(rows.every((row) => row.options.filter((o) => o.isCorrect).length === 1));
    assert.ok(rows.every((row) => row.isCorrect === true), "all answers match the marked-correct option");
    // Now answer a different option for the first question → that row is wrong.
    const firstQ = content.questions[0];
    const otherOption = firstQ.options.find((o) => o.id !== firstQ.options[0].id).id;
    const wrongResult = { ...result, correctCount: size - 1, wrongCount: 1 };
    const wrongRows = adapter.buildAnswerReviewDisplay({
      attempt: { ...attempt, answers: { ...answers, [firstQ.id]: otherOption } },
      result: wrongResult,
    });
    assert.equal(wrongRows.filter((r) => !r.isCorrect).length, 1);
  });
}
