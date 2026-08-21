import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { createServer } from "vite";
import {
  biologyConfirmedReviewFailureMessage,
  biologyResultStatus,
} from "../src/quizzes/01-biology/biologyResultPresentation.js";

const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true },
});
const biologyQuizModule = await vite.ssrLoadModule("/src/quizzes/01-biology/BiologyQuiz.jsx");
await vite.close();

const answerReview = Array.from({ length: 20 }, (_, index) => {
  const position = index + 1;
  const selectedAnswer = position === 3
    ? null
    : { letter: position === 2 ? "B" : "A", text: `作答 ${position}` };
  return {
    id: `row-${position}`,
    attemptPosition: position,
    text: `題目 ${String(position).padStart(2, "0")}`,
    isCorrect: position !== 2 && position !== 3,
    selectedAnswer,
    correctAnswer: { letter: "A", text: `正解 ${position}` },
    explanation: `解析 ${position}`,
  };
});

const presentationStyles = {
  serifStyle: { fontFamily: "serif" },
  monoStyle: { fontFamily: "monospace" },
  INK: "#2C4B7C",
  RED: "#B23A2E",
  GREEN: "#3F6B4A",
  INKDARK: "#241F1B",
};

function resultReviewMarkup(props) {
  assert.equal(typeof biologyQuizModule.BiologyResultReview, "function");
  return renderToStaticMarkup(React.createElement(
    biologyQuizModule.BiologyResultReview,
    { ...presentationStyles, ...props },
  ));
}

test("biology labels a complete current result for answer review", () => {
  assert.equal(biologyResultStatus({ reviewAvailable: true }), "成績與解析");
});

test("biology labels a legacy result without fabricating answer review", () => {
  assert.equal(
    biologyResultStatus({ reviewAvailable: false }),
    "完成紀錄已保存；此筆舊成績沒有逐題解析，因此只顯示總成績。",
  );
});

test("biology reports a confirmed result whose review cannot be displayed", () => {
  assert.equal(
    biologyConfirmedReviewFailureMessage(),
    "完成紀錄已保存，但解析暫時無法顯示，請重新整理頁面。",
  );
});

test("biology renders all current review rows in order with complete answer feedback", () => {
  const markup = resultReviewMarkup({ answerReview, reviewAvailable: true });

  assert.match(markup, /<section[^>]+aria-labelledby="biology-answer-review-heading"/);
  assert.match(markup, /<h2[^>]+id="biology-answer-review-heading"[^>]*>成績與解析（20 題）<\/h2>/);
  assert.equal((markup.match(/<ol\b/g) ?? []).length, 1);
  assert.equal((markup.match(/<li\b/g) ?? []).length, 20);
  for (let position = 1; position <= 20; position += 1) {
    const currentIndex = markup.indexOf(`題目 ${String(position).padStart(2, "0")}`);
    const nextIndex = markup.indexOf(`題目 ${String(position + 1).padStart(2, "0")}`);
    assert.notEqual(currentIndex, -1);
    if (position < 20) assert.ok(currentIndex < nextIndex);
  }
  assert.match(markup, /✓ 答對/);
  assert.match(markup, /✕ 答錯/);
  assert.match(markup, /你的答案：[\s\S]*\(B\) 作答 2/);
  assert.match(markup, /你的答案：[\s\S]*未作答/);
  assert.match(markup, /正確答案：[\s\S]*\(A\) 正解 2/);
  assert.match(markup, /💡[\s\S]*解題觀念：[\s\S]*解析 2/);
});

test("biology renders a legacy score message without result-card list items", () => {
  const markup = resultReviewMarkup({ answerReview: [], reviewAvailable: false });

  assert.match(
    markup,
    /完成紀錄已保存；此筆舊成績沒有逐題解析，因此只顯示總成績。/,
  );
  assert.equal((markup.match(/<li\b/g) ?? []).length, 0);
});

test("biology save errors render as a polite alert live region", () => {
  assert.equal(typeof biologyQuizModule.BiologySaveError, "function");
  const markup = renderToStaticMarkup(React.createElement(
    biologyQuizModule.BiologySaveError,
    { message: "完成紀錄已保存，但解析暫時無法顯示，請重新整理頁面。", RED: "#B23A2E" },
  ));

  assert.match(markup, /role="alert"/);
  assert.match(markup, /aria-live="polite"/);
  assert.match(markup, /完成紀錄已保存，但解析暫時無法顯示，請重新整理頁面。/);
});
