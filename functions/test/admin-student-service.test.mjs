import assert from "node:assert/strict";
import test from "node:test";
import { removeOrDeactivateStudent } from "../adminStudentService.js";

const functionsEntrypoint = await import("../index.js");

const ADMIN_AUTH = {
  uid: "admin-uid",
  token: {
    email: "beyle931224@gmail.com",
    email_verified: true,
    firebase: { sign_in_provider: "google.com" },
  },
};

function memoryRepository({ attempts = [], student = {} } = {}) {
  const state = {
    student: {
      id: "student-1", name: "王小明", code: "20260809-001", active: true,
      ownerUid: "admin-uid", ownerType: "admin", requestUid: "parent-uid", ...student,
    },
    attempts: structuredClone(attempts),
    privateAttempts: [{ id: "a1", maskedIp: "203.0.113.xxx" }],
    progress: [
      { id: "biology", activeAttempt: { attemptId: "active-1" }, reviewProgress: { q1: { stage: 2 } } },
      { id: "english-review-2", activeAttempt: null, reviewProgress: {} },
    ],
    entry: true,
    adminLink: true,
    parentAccess: true,
    counter: 99,
  };
  return {
    state,
    async runAdminStudentTransaction(studentId, callback) {
      assert.equal(studentId, "student-1");
      return callback({
        getStudent: () => structuredClone(state.student),
        listAttempts: () => structuredClone(state.attempts),
        listProgress: () => structuredClone(state.progress),
        deactivate({ progress }) {
          state.student.active = false;
          state.entry = false;
          state.progress = structuredClone(progress);
        },
        deleteExact() {
          state.student = null;
          state.entry = false;
          state.progress = [];
          state.adminLink = false;
          state.parentAccess = false;
        },
      });
    },
  };
}

test("rejects every caller except the verified Google administrator", async () => {
  const invalid = [
    null,
    { ...ADMIN_AUTH, token: { ...ADMIN_AUTH.token, email_verified: false } },
    { ...ADMIN_AUTH, token: { ...ADMIN_AUTH.token, email: "teacher@example.com" } },
    { ...ADMIN_AUTH, token: { ...ADMIN_AUTH.token, firebase: { sign_in_provider: "password" } } },
  ];
  for (const auth of invalid) {
    await assert.rejects(
      removeOrDeactivateStudent({ repository: memoryRepository(), auth, input: { studentId: "student-1" } }),
      /admin-required/,
    );
  }
});

test("any result type deactivates and preserves immutable history while clearing active progress", async () => {
  for (const attempt of [
    { id: "score", studentId: "student-1", resultType: "score" },
    { id: "placement", studentId: "student-1", resultType: "placement" },
    { id: "legacy", studentId: "student-1", score: 90 },
  ]) {
    const repository = memoryRepository({ attempts: [attempt] });
    const beforeAttempts = structuredClone(repository.state.attempts);
    const beforePrivate = structuredClone(repository.state.privateAttempts);
    const result = await removeOrDeactivateStudent({
      repository, auth: ADMIN_AUTH, input: { studentId: "student-1" },
    });
    assert.deepEqual(result, { status: "deactivated" });
    assert.equal(repository.state.student.active, false);
    assert.equal(repository.state.entry, false);
    assert.deepEqual(repository.state.attempts, beforeAttempts);
    assert.deepEqual(repository.state.privateAttempts, beforePrivate);
    assert.deepEqual(repository.state.progress[0].reviewProgress, { q1: { stage: 2 } });
    assert.equal(repository.state.progress.every((item) => item.activeAttempt === null), true);
    assert.equal(repository.state.adminLink, true);
    assert.equal(repository.state.parentAccess, true);
    assert.equal(repository.state.counter, 99);
  }
});

test("global admin deactivates a parent-created student without owner fields", async () => {
  const repository = memoryRepository({
    attempts: [{ id: "a1", studentId: "student-1", resultType: "score" }],
    student: { ownerUid: undefined, ownerType: undefined, requestUid: "parent-uid" },
  });
  const result = await removeOrDeactivateStudent({
    repository, auth: ADMIN_AUTH, input: { studentId: "student-1" },
  });
  assert.deepEqual(result, { status: "deactivated" });
  assert.equal(repository.state.student.active, false);
  assert.equal(repository.state.parentAccess, true);
  assert.equal(repository.state.adminLink, true);
  assert.equal(repository.state.progress[0].activeAttempt, null);
});

test("global admin permanently deletes a legacy student without ownership metadata", async () => {
  const repository = memoryRepository({
    attempts: [],
    student: { ownerUid: undefined, ownerType: undefined, requestUid: undefined },
  });
  const result = await removeOrDeactivateStudent({
    repository, auth: ADMIN_AUTH, input: { studentId: "student-1" },
  });
  assert.deepEqual(result, { status: "deleted" });
  assert.equal(repository.state.student, null);
});

test("no attempt deletes exact access records and progress without recycling counter", async () => {
  const repository = memoryRepository({ attempts: [] });
  const result = await removeOrDeactivateStudent({
    repository, auth: ADMIN_AUTH, input: { studentId: "student-1" },
  });
  assert.deepEqual(result, { status: "deleted" });
  assert.equal(repository.state.student, null);
  assert.equal(repository.state.entry, false);
  assert.deepEqual(repository.state.progress, []);
  assert.equal(repository.state.adminLink, false);
  assert.equal(repository.state.parentAccess, false);
  assert.equal(repository.state.counter, 99);
});

test("requires a valid target while global admin does not depend on caller role or mode", async () => {
  await assert.rejects(
    removeOrDeactivateStudent({ repository: memoryRepository(), auth: ADMIN_AUTH, input: { studentId: "../x" } }),
    /invalid-student-id/,
  );
  await assert.rejects(
    removeOrDeactivateStudent({
      repository: memoryRepository(), auth: ADMIN_AUTH,
      input: { studentId: "student-1", ownerUid: "admin-uid" },
    }),
    /invalid-student-id/,
  );
});

test("retry after an exact deletion is idempotent", async () => {
  const repository = memoryRepository({ attempts: [] });
  await removeOrDeactivateStudent({
    repository, auth: ADMIN_AUTH, input: { studentId: "student-1" },
  });
  const result = await removeOrDeactivateStudent({
    repository, auth: ADMIN_AUTH, input: { studentId: "student-1" },
  });
  assert.deepEqual(result, { status: "deleted" });
});

test("admin callable exposes stable authorization and validation errors", async () => {
  assert.equal(typeof functionsEntrypoint.removeOrDeactivateStudent?.run, "function");
  await assert.rejects(
    functionsEntrypoint.removeOrDeactivateStudent.run({ auth: null, data: { studentId: "student-1" } }),
    (error) => error.code === "permission-denied" && error.message === "admin-required",
  );
});
