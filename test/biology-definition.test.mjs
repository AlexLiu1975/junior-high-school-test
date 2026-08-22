import assert from "node:assert/strict";
import test from "node:test";
import { QUIZ_DEFINITION } from "../functions/shared/quizzes/01-biology/biologyDefinition.js";

test("Biology version 2 has one answer and one substantive explanation per question", () => {
  assert.equal(QUIZ_DEFINITION.version, 2);
  assert.equal(QUIZ_DEFINITION.questions.length, 20);
  for (const question of QUIZ_DEFINITION.questions) {
    assert.equal(question.options.filter(({ correct }) => correct).length, 1);
    assert.equal(typeof question.explanation, "string");
    assert.ok(question.explanation.trim().length >= 20);
  }
});

test("Biology version 2 corrects question 14 for the dissecting microscope", () => {
  assert.equal(QUIZ_DEFINITION.questions[13].options[1].correct, true);
  assert.match(QUIZ_DEFINITION.questions[13].explanation, /解剖顯微鏡.*立體/);
});
