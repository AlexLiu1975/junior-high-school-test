import assert from "node:assert/strict";
import test from "node:test";
import {
  prepareQuiz,
  shuffleCopy,
} from "../src/quizRandomization.js";

const questions = [
  {
    id: "q1",
    n: 1,
    text: "第一題",
    options: [
      { id: "q1-o1", text: "甲" },
      { id: "q1-o2", text: "乙" },
      { id: "q1-o3", text: "丙" },
      { id: "q1-o4", text: "丁" },
    ],
  },
  {
    id: "q2",
    n: 2,
    text: "第二題",
    options: [
      { id: "q2-o1", text: "戊" },
      { id: "q2-o2", text: "己" },
      { id: "q2-o3", text: "庚" },
      { id: "q2-o4", text: "辛" },
    ],
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
      preparedQuestion.options.map(({ id }) => id).sort(),
      source.options.map(({ id }) => id).sort(),
    );
    assert.equal("correct" in preparedQuestion, false);
    assert.equal(preparedQuestion.options.some((option) => "isCorrect" in option), false);
    assert.equal(
      preparedQuestion.options.every((option) => typeof option.id === "string"),
      true,
    );
  }
  assert.deepEqual(questions, sourceSnapshot);
});

test("prepareQuiz deterministically shuffles every question's options", () => {
  const prepared = prepareQuiz(questions, alwaysZero);
  const optionsById = Object.fromEntries(
    prepared.map((question) => [
      question.id,
      question.options.map(({ text }) => text),
    ]),
  );

  assert.deepEqual(optionsById, {
    q1: ["乙", "丙", "丁", "甲"],
    q2: ["己", "庚", "辛", "戊"],
  });
});

test("prepared browser questions never acquire local correctness metadata", () => {
  const prepared = prepareQuiz(questions, alwaysZero);
  assert.equal(prepared.every((question) => question.options.every((option) => (
    Object.keys(option).sort().join(",") === "id,text"
  ))), true);
});

test("prepareQuiz rejects an empty question bank", () => {
  assert.throws(() => prepareQuiz([], alwaysZero), /empty-question-bank/);
});
