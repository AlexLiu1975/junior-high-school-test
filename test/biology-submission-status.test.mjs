import test from "node:test";
import assert from "node:assert/strict";
import { biologySubmissionFailureMessage } from "../src/biologySubmissionStatus.js";

test("biology distinguishes a failed submit from a confirmed result-display failure", () => {
  assert.equal(
    biologySubmissionFailureMessage({ confirmed: false }),
    "作答紀錄尚未送出，資料已保留；請檢查網路後重試。",
  );
  assert.equal(
    biologySubmissionFailureMessage({ confirmed: true }),
    "完成紀錄已保存；結果顯示失敗，請重新整理頁面。",
  );
});
