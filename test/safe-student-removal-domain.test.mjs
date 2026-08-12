import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStudentRemovalConfirmation,
  validateStudentRemovalTarget,
} from "../src/safeStudentRemovalDomain.js";

test("confirmation names the student, code, and both possible consequences", () => {
  const result = buildStudentRemovalConfirmation({
    id: "student-1",
    name: "王小明",
    code: "20260809-001",
  });
  assert.match(result, /王小明/);
  assert.match(result, /20260809-001/);
  assert.match(result, /已有測驗紀錄.*停用/);
  assert.match(result, /沒有測驗紀錄.*永久刪除/);
});

test("removal target accepts only a bounded document id", () => {
  assert.equal(validateStudentRemovalTarget("student_1-A"), "student_1-A");
  for (const value of ["", "../student", "a/b", " 空白", "a".repeat(129), null]) {
    assert.throws(() => validateStudentRemovalTarget(value), /invalid-student-id/);
  }
});
