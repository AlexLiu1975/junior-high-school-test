import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAttemptRecord,
  normalizeStudentCode,
  validateStudentIdentity,
} from "../src/quizDomain.js";

test("normalizes a student code and trims a valid name", () => {
  assert.equal(normalizeStudentCode(" 20260726-001 "), "20260726-001");
  assert.deepEqual(
    validateStudentIdentity({
      studentCode: " 20260726-001 ",
      studentName: " 王小明 ",
    }),
    {
      valid: true,
      studentCode: "20260726-001",
      studentName: "王小明",
      error: null,
    },
  );
});

test("rejects invalid names and codes", () => {
  for (const identity of [
    { studentCode: "", studentName: "王小明" },
    { studentCode: "20260726-01", studentName: "王小明" },
    { studentCode: "20260726-001", studentName: "" },
    { studentCode: "20260726-001", studentName: "王/小明" },
    { studentCode: "20260726-001", studentName: "甲".repeat(41) },
  ]) {
    assert.equal(validateStudentIdentity(identity).valid, false);
  }
});

test("builds a bounded attempt record", () => {
  assert.deepEqual(
    buildAttemptRecord({
      identity: {
        studentId: "student-1",
        studentCode: "20260726-001",
        studentName: "王小明",
      },
      uid: "anonymous-uid",
      quizId: "cell-microscope-quiz1",
      quizTitle: "第1回 第1、2單元｜細胞與顯微鏡",
      correctCount: 16,
      totalQuestions: 20,
    }),
    {
      quizId: "cell-microscope-quiz1",
      quizTitle: "第1回 第1、2單元｜細胞與顯微鏡",
      studentUid: "anonymous-uid",
      studentId: "student-1",
      studentCode: "20260726-001",
      studentName: "王小明",
      score: 80,
      correctCount: 16,
      wrongCount: 4,
    },
  );
});
