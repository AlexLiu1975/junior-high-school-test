import assert from "node:assert/strict";
import test from "node:test";
import { planAdminStudentCreation } from "../src/adminStudentService.js";

test("plans every write for one admin-owned student", () => {
  const result = planAdminStudentCreation({
    adminUid: "admin-uid",
    studentId: "student-1",
    studentName: "王小明",
    studentCode: "20260801-001",
    sequence: 1,
  });
  assert.deepEqual(result, {
    student: {
      name: "王小明",
      code: "20260801-001",
      active: true,
      ownerUid: "admin-uid",
      ownerType: "admin",
    },
    entry: { active: true, studentId: "student-1" },
    link: { studentId: "student-1" },
    nextSequence: 2,
  });
});
