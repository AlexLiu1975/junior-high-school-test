import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyStudentSyncError,
  createLocalProgressStore,
  createStudentSyncClient,
  pendingAttemptStorageKey,
  progressStorageKey,
  resolveProgressConflict,
  toLocalProgressSnapshot,
} from "../src/studentSyncDomain.js";

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

const PROGRESS = {
  activeAttempt: { attemptId: "run-1", answers: { q1: "q1-o1" } },
  reviewProgress: {},
};

test("local keys isolate student and quiz", () => {
  assert.equal(
    progressStorageKey("student-1", "english-review-2"),
    "jhst:progress:student-1:english-review-2",
  );
  assert.notEqual(
    progressStorageKey("student-1", "english-review-2"),
    progressStorageKey("student-1", "periodic-table"),
  );
  assert.notEqual(
    progressStorageKey("student-1", "periodic-table"),
    progressStorageKey("student-2", "periodic-table"),
  );
  assert.equal(
    pendingAttemptStorageKey("student-1", "periodic-table"),
    "jhst:pending-attempt:student-1:periodic-table",
  );
});

test("local progress store never persists raw student names or codes", () => {
  const storage = createMemoryStorage();
  const store = createLocalProgressStore(storage);

  assert.throws(
    () => store.save("progress-key", { studentName: "王小明", ...PROGRESS }),
    /raw-student-identity-not-allowed/,
  );
  assert.throws(
    () => store.save("progress-key", { nested: { studentCode: "secret" } }),
    /raw-student-identity-not-allowed/,
  );
  assert.equal(storage.getItem("progress-key"), null);
});

test("newer unsynced local work requires an explicit choice", () => {
  const local = {
    updatedAtMs: 2_000,
    pendingSync: true,
    activeAttempt: { answers: { q1: "q1-o1" } },
    reviewProgress: {},
  };
  const cloud = {
    updatedAtMs: 1_000,
    pendingSync: false,
    activeAttempt: { answers: {} },
    reviewProgress: {},
  };

  assert.deepEqual(resolveProgressConflict({ local, cloud }), {
    mode: "choice",
    local,
    cloud,
  });
});

test("an empty cloud record cannot appear newer than unsynced local work", () => {
  const local = {
    updatedAtMs: 2_000,
    pendingSync: true,
    activeAttempt: { answers: { q1: "q1-o1" } },
    reviewProgress: {},
  };
  const emptyCloud = toLocalProgressSnapshot({
    activeAttempt: null,
    reviewProgress: {},
    updatedAt: null,
  }, { pendingSync: false, now: () => 9_000 });

  assert.equal(emptyCloud.updatedAtMs, 0);
  assert.equal(resolveProgressConflict({ local, cloud: emptyCloud }).mode, "choice");
});

test("resolved progress chooses the available or newer acknowledged snapshot", () => {
  const local = { updatedAtMs: 1_000, pendingSync: false, activeAttempt: null, reviewProgress: {} };
  const cloud = { updatedAtMs: 2_000, activeAttempt: null, reviewProgress: {} };

  assert.deepEqual(resolveProgressConflict({ local: null, cloud }), {
    mode: "cloud",
    value: cloud,
  });
  assert.deepEqual(resolveProgressConflict({ local, cloud: null }), {
    mode: "local",
    value: local,
  });
  assert.deepEqual(resolveProgressConflict({ local, cloud }), {
    mode: "cloud",
    value: cloud,
  });
});

test("accepting cloud progress replaces a stale local conflict snapshot", () => {
  const storage = createMemoryStorage();
  const client = createStudentSyncClient({
    storage,
    callSave: async () => ({}),
    callSubmit: async () => ({}),
  });
  client.queueSave({
    studentId: "student-1",
    quizId: "periodic-table",
    progress: PROGRESS,
    request: PROGRESS,
  });

  client.replaceLocalProgress({
    studentId: "student-1",
    quizId: "periodic-table",
    progress: {
      updatedAtMs: 3_000,
      activeAttempt: null,
      reviewProgress: {},
    },
  });

  assert.deepEqual(client.load("student-1", "periodic-table"), {
    updatedAtMs: 3_000,
    pendingSync: false,
    activeAttempt: null,
    reviewProgress: {},
  });
  client.dispose();
});

test("queued saves persist locally first and coalesce to the latest cloud request", async () => {
  const storage = createMemoryStorage();
  const calls = [];
  const client = createStudentSyncClient({
    storage,
    debounceMs: 20,
    now: () => 1_234,
    callSave: async (request) => {
      calls.push(request);
      return { ...request, updatedAtMs: 1_300 };
    },
    callSubmit: async () => ({ attemptId: "unused" }),
  });
  const identityRequest = { studentName: "王小明", studentCode: "private-code" };

  client.queueSave({
    studentId: "student-1",
    quizId: "english-review-2",
    progress: PROGRESS,
    request: { ...identityRequest, ...PROGRESS, page: 1 },
  });
  client.queueSave({
    studentId: "student-1",
    quizId: "english-review-2",
    progress: { ...PROGRESS, activeAttempt: { ...PROGRESS.activeAttempt, page: 2 } },
    request: { ...identityRequest, ...PROGRESS, page: 2 },
  });

  const storedBeforeCloud = JSON.parse(storage.getItem(
    "jhst:progress:student-1:english-review-2",
  ));
  assert.equal(storedBeforeCloud.pendingSync, true);
  assert.equal(storedBeforeCloud.activeAttempt.page, 2);
  assert.doesNotMatch(JSON.stringify(storedBeforeCloud), /王小明|private-code/);

  await client.flush();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].page, 2);
  assert.equal(JSON.parse(storage.getItem(
    "jhst:progress:student-1:english-review-2",
  )).pendingSync, false);
  client.dispose();
});

test("failed saves remain pending locally", async () => {
  const storage = createMemoryStorage();
  const client = createStudentSyncClient({
    storage,
    debounceMs: 0,
    callSave: async () => {
      throw Object.assign(new Error("offline"), { code: "functions/unavailable" });
    },
    callSubmit: async () => ({ attemptId: "unused" }),
  });

  client.queueSave({
    studentId: "student-1",
    quizId: "biology-cell-microscope-1",
    progress: PROGRESS,
    request: PROGRESS,
  });
  await assert.rejects(client.flush(), /offline/);

  assert.equal(JSON.parse(storage.getItem(
    "jhst:progress:student-1:biology-cell-microscope-1",
  )).pendingSync, true);
  client.dispose();
});

test("a failed cloud save remains available for an explicit retry", async () => {
  const storage = createMemoryStorage();
  let offline = true;
  let calls = 0;
  const client = createStudentSyncClient({
    storage,
    debounceMs: 60_000,
    callSave: async () => {
      calls += 1;
      if (offline) throw new Error("offline");
      return { updatedAtMs: 2_000, ...PROGRESS };
    },
    callSubmit: async () => ({ attemptId: "unused" }),
  });
  client.queueSave({
    studentId: "student-1",
    quizId: "english-review-2",
    progress: PROGRESS,
    request: PROGRESS,
  });

  await assert.rejects(client.flush(), /offline/);
  offline = false;
  await client.flush();

  assert.equal(calls, 2);
  assert.equal(JSON.parse(storage.getItem(
    "jhst:progress:student-1:english-review-2",
  )).pendingSync, false);
  client.dispose();
});

test("pending submission is removed only after server acknowledgement", async () => {
  const storage = createMemoryStorage();
  let rejectSubmit = true;
  const client = createStudentSyncClient({
    storage,
    debounceMs: 0,
    callSave: async () => ({}),
    callSubmit: async () => {
      if (rejectSubmit) throw new Error("offline");
      return { attemptId: "run-1" };
    },
  });
  const submission = {
    attemptId: "run-1",
    answers: { q1: "q1-o1" },
    studentName: "王小明",
    studentCode: "private-code",
  };

  await assert.rejects(client.submit({
    studentId: "student-1",
    quizId: "biology-cell-microscope-1",
    submission,
    request: submission,
  }), /offline/);
  const pendingKey = "jhst:pending-attempt:student-1:biology-cell-microscope-1";
  assert.notEqual(storage.getItem(pendingKey), null);
  assert.doesNotMatch(storage.getItem(pendingKey), /王小明|private-code/);

  rejectSubmit = false;
  await client.submit({
    studentId: "student-1",
    quizId: "biology-cell-microscope-1",
    submission,
    request: submission,
  });
  assert.equal(storage.getItem(pendingKey), null);
  client.dispose();
});

test("dispose cancels a queued timer without calling the cloud", async () => {
  const storage = createMemoryStorage();
  let calls = 0;
  const client = createStudentSyncClient({
    storage,
    debounceMs: 10,
    callSave: async () => {
      calls += 1;
      return {};
    },
    callSubmit: async () => ({}),
  });
  client.queueSave({
    studentId: "student-1",
    quizId: "periodic-table",
    progress: PROGRESS,
    request: PROGRESS,
  });
  client.dispose();

  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(calls, 0);
});

test("student sync errors preserve distinct actionable states", () => {
  assert.equal(
    classifyStudentSyncError(new Error("Firebase configuration is missing: apiKey")),
    "missing-config",
  );
  assert.equal(
    classifyStudentSyncError(Object.assign(new Error("invalid-student-identity"), {
      code: "functions/invalid-argument",
    })),
    "bad-identity",
  );
  assert.equal(
    classifyStudentSyncError(Object.assign(new Error("student-inactive"), {
      code: "functions/failed-precondition",
    })),
    "inactive-student",
  );
  assert.equal(
    classifyStudentSyncError(Object.assign(new Error("offline"), {
      code: "functions/unavailable",
    })),
    "offline-pending",
  );
  assert.equal(
    classifyStudentSyncError(Object.assign(new Error("denied"), {
      code: "functions/permission-denied",
    })),
    "permission-denied",
  );
  assert.equal(
    classifyStudentSyncError(Object.assign(new Error("invalid-quiz"), {
      code: "functions/invalid-argument",
    })),
    "version-mismatch",
  );
});
