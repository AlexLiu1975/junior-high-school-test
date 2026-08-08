import assert from "node:assert/strict";
import test from "node:test";

import {
  catalogQuizUrl,
  resolveQuizRoute,
} from "../src/quizCatalogDomain.js";

test("catalog routes only the three registered IDs", () => {
  assert.equal(resolveQuizRoute("").mode, "catalog");
  assert.deepEqual(resolveQuizRoute("?quiz=english-review-2"), {
    mode: "quiz",
    quizId: "english-review-2",
    quiz: {
      id: "english-review-2",
      version: 1,
      kind: "multiple-choice",
      subject: "English",
      title: "英語科 第2回複習考",
      catalogDescription: "第一冊 L3～L4（表位置的介系詞／Where問答／祈使句／人稱代名詞受格／can問答）",
    },
  });
  assert.equal(resolveQuizRoute("?quiz=unknown").mode, "not-found");
  assert.equal(resolveQuizRoute("?quiz=English-Review-2").mode, "not-found");
  assert.equal(resolveQuizRoute("?quiz=english-review-2&quiz=periodic-table").mode, "not-found");
});

test("catalog URLs remain stable below the deployed Pages base path", () => {
  assert.equal(
    catalogQuizUrl("periodic-table", "/junior-high-school-test/"),
    "/junior-high-school-test/quiz.html?quiz=periodic-table",
  );
});
