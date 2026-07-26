import assert from "node:assert/strict";
import test from "node:test";
import {
  isAnswerCorrect,
  prepareQuiz,
  scoreQuiz,
  shuffleCopy,
} from "../src/quizRandomization.js";

const questions = [
  {
    id: "q1",
    n: 1,
    text: "第一題",
    options: ["甲", "乙", "丙", "丁"],
    correct: 1,
  },
  {
    id: "q2",
    n: 2,
    text: "第二題",
    options: ["戊", "己", "庚", "辛"],
    correct: 3,
  },
];

const alwaysZero = () => 0;

test("shuffleCopy returns a changed copy without mutating its input", () => {
  const input = ["A", "B", "C", "D"];
  const result = shuffleCopy(input, alwaysZero);
  assert.deepEqual(result, ["B", "C", "D", "A"]);
  assert.deepEqual(input, ["A", "B", "C", "D"]);
  assert.notEqual(result, input);
});

test("prepareQuiz preserves every question and option exactly once", () => {
  const sourceSnapshot = structuredClone(questions);
  const prepared = prepareQuiz(questions, alwaysZero);

  assert.deepEqual(prepared.map(({ id }) => id), ["q2", "q1"]);
  assert.deepEqual(
    prepared.map(({ id }) => id).sort(),
    questions.map(({ id }) => id).sort(),
  );
  for (const preparedQuestion of prepared) {
    const source = questions.find(({ id }) => id === preparedQuestion.id);
    assert.deepEqual(
      preparedQuestion.options.map(({ text }) => text).sort(),
      [...source.options].sort(),
    );
    assert.equal(
      preparedQuestion.options.filter(({ isCorrect }) => isCorrect).length,
      1,
    );
    assert.equal("correct" in preparedQuestion, false);
  }
  assert.deepEqual(questions, sourceSnapshot);
});

test("prepared correctness survives option randomization and scores by stable id", () => {
  const prepared = prepareQuiz(questions, alwaysZero);
  const correctAnswers = Object.fromEntries(
    prepared.map((question) => [
      question.id,
      question.options.findIndex(({ isCorrect }) => isCorrect),
    ]),
  );
  assert.equal(
    prepared.every((question) =>
      isAnswerCorrect(question, correctAnswers[question.id]),
    ),
    true,
  );
  assert.deepEqual(scoreQuiz(prepared, correctAnswers), {
    correctCount: 2,
    wrongIds: [],
  });

  const oneMissing = { ...correctAnswers };
  delete oneMissing.q1;
  assert.deepEqual(scoreQuiz(prepared, oneMissing), {
    correctCount: 1,
    wrongIds: ["q1"],
  });
});

test("prepareQuiz rejects an empty question bank", () => {
  assert.throws(() => prepareQuiz([], alwaysZero), /empty-question-bank/);
});
