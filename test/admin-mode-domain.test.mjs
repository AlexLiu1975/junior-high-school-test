import assert from "node:assert/strict";
import test from "node:test";
import { getAdminViewData } from "../src/adminModeDomain.js";

test("management mode shows all attempts", () => {
  assert.deepEqual(
    getAdminViewData({
      mode: "manage",
      allAttempts: [{ id: "all" }],
      ownStudents: [{ id: "student-1" }],
      ownAttempts: [{ id: "own" }],
    }),
    { students: [], attempts: [{ id: "all" }] },
  );
});

test("student mode shows only admin-owned students and attempts", () => {
  assert.deepEqual(
    getAdminViewData({
      mode: "students",
      allAttempts: [{ id: "all" }],
      ownStudents: [{ id: "student-1" }],
      ownAttempts: [{ id: "own" }],
    }),
    { students: [{ id: "student-1" }], attempts: [{ id: "own" }] },
  );
});
