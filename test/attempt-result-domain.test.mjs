import assert from "node:assert/strict";
import test from "node:test";
import { formatAttemptResult, matchesAttemptSearch } from "../src/attemptResultDomain.js";

test("formats score and placement attempts", () => {
  assert.equal(
    formatAttemptResult({ resultType: "score", score: 85, correctCount: 34, wrongCount: 6 }),
    "85 分｜答對 34｜答錯 6",
  );
  assert.equal(
    formatAttemptResult({ resultType: "placement", completedCount: 118, totalItems: 118, errorCount: 9, durationSeconds: 755 }),
    "完成 118／118｜錯誤 9 次｜12分35秒",
  );
});

test("record search covers student, code, subject, and quiz title", () => {
  const attempt = {
    studentName: "王小明",
    studentCode: "20260809-001",
    subject: "英文",
    quizTitle: "英文 Review 2",
  };
  for (const keyword of ["小明", "0809-001", "英文", "review 2"]) {
    assert.equal(matchesAttemptSearch(attempt, keyword), true);
  }
  assert.equal(matchesAttemptSearch(attempt, "元素"), false);
  assert.equal(matchesAttemptSearch({ studentName: "舊資料" }, "生物"), true);
});

test("formats legacy biology attempts from old score fields", () => {
  assert.equal(
    formatAttemptResult({ score: 75, correctCount: 15, totalQuestions: 20 }),
    "75 分｜答對 15｜答錯 5",
  );
  assert.equal(formatAttemptResult({ correctCount: 12, totalQuestions: 20 }), "答對 12／20");
  assert.equal(formatAttemptResult({}), "尚無成績");
});
