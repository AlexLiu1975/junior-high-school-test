import assert from "node:assert/strict";
import test from "node:test";
import {
  biologyConfirmedReviewFailureMessage,
  biologyResultStatus,
} from "../src/biologyResultPresentation.js";

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
