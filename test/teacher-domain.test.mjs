import assert from "node:assert/strict";
import test from "node:test";
import {
  buildParentApprovalPaths,
  buildTeacherAccess,
  formatStudentCode,
  getPortalState,
  validateAccessApplication,
} from "../src/teacherDomain.js";

const adminEmail = "beyle931224@gmail.com";

test("maps authentication and approval states", () => {
  assert.equal(
    getPortalState({ user: null, request: null, access: null, adminEmail }),
    "signed-out",
  );
  assert.equal(
    getPortalState({
      user: { email: "p@example.com" },
      request: null,
      access: null,
      adminEmail,
    }),
    "apply",
  );
  assert.equal(
    getPortalState({
      user: { email: "p@example.com" },
      request: { status: "pending" },
      access: null,
      adminEmail,
    }),
    "pending",
  );
  assert.equal(
    getPortalState({
      user: { email: "p@example.com" },
      request: null,
      access: { role: "parent" },
      adminEmail,
    }),
    "parent",
  );
  assert.equal(
    getPortalState({
      user: { email: adminEmail, emailVerified: true },
      request: null,
      access: null,
      adminEmail,
    }),
    "admin",
  );
});

test("requires one student name for parent applications", () => {
  assert.equal(
    validateAccessApplication({ role: "teacher", studentName: "" }).valid,
    true,
  );
  assert.equal(
    validateAccessApplication({ role: "parent", studentName: "" }).valid,
    false,
  );
  assert.equal(
    validateAccessApplication({ role: "parent", studentName: "王小明" }).valid,
    true,
  );
});

test("formats an Asia Taipei request date and sequence", () => {
  const date = new Date("2026-07-25T16:30:00.000Z");
  assert.equal(formatStudentCode(date, 1), "20260726-001");
  assert.throws(() => formatStudentCode(date, 1000), /daily-code-limit/);
});

test("builds teacher access without student scope", () => {
  assert.deepEqual(buildTeacherAccess({ uid: "teacher-uid" }), {
    uid: "teacher-uid",
    role: "teacher",
    studentIds: [],
  });
});

test("builds deterministic parent approval paths", () => {
  const paths = buildParentApprovalPaths({
    request: {
      uid: "parent-uid",
      studentName: " 王小明 ",
      requestedAt: new Date("2026-07-25T16:30:00.000Z"),
    },
    sequence: 1,
  });
  assert.deepEqual(paths, {
    studentCode: "20260726-001",
    counterPath: "dailyCounters/20260726",
    entryPath: "studentEntries/20260726-001/names/王小明",
    accessPath: "viewerAccess/parent-uid",
    requestPath: "accessRequests/parent-uid",
  });
  assert.throws(
    () =>
      buildParentApprovalPaths({
        request: {
          uid: "parent-uid",
          studentName: "王小明",
          requestedAt: new Date("2026-07-25T16:30:00.000Z"),
        },
        sequence: 1000,
      }),
    /daily-code-limit/,
  );
});
