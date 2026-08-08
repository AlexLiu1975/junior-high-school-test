import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTrustedProgressRequest,
  buildTrustedSubmissionRequest,
  classifyStudentSyncError,
  createLocalProgressStore,
  createStudentSyncClient,
  pendingAttemptStorageKey,
  progressStorageKey,
  recoverStudentSyncOnline,
  refreshProgressAfterSubmission,
  resolveProgressConflict,
  toLocalProgressSnapshot,
  submitWithProgressRefresh,
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

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
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
  for (const identityLikeValue of [
    { StudentName: "王小明" },
    { student_name: "王小明" },
    { "student-code": "private-code" },
    { nested: [{ "Student Code": "private-code" }] },
  ]) {
    assert.throws(
      () => store.save("progress-key", identityLikeValue),
      /raw-student-identity-not-allowed/,
    );
  }
  assert.equal(storage.getItem("progress-key"), null);
});

test("callable Admin Timestamp transport converts to milliseconds", () => {
  const snapshot = toLocalProgressSnapshot({
    revision: 4,
    activeAttempt: null,
    reviewProgress: {},
    updatedAt: { _seconds: 1_700_000_000, _nanoseconds: 987_654_321 },
  }, { pendingSync: false });

  assert.equal(snapshot.updatedAtMs, 1_700_000_000_987);
  assert.equal(snapshot.revision, 4);
});

test("pending progress always receives a fresh local modification time", () => {
  const snapshot = toLocalProgressSnapshot({
    revision: 4,
    activeAttempt: PROGRESS.activeAttempt,
    reviewProgress: {},
    updatedAtMs: 100,
  }, { pendingSync: true, now: () => 900 });

  assert.equal(snapshot.updatedAtMs, 900);
});

test("trusted credentials override and remove identity-like renderer fields", () => {
  const request = buildTrustedSubmissionRequest({
    submission: {
      attemptId: "run-1",
      studentName: "attacker",
      StudentName: "attacker-2",
      student_code: "attacker-code",
      nested: { "student-code": "nested-attacker" },
    },
    credentials: { studentName: "王小明", studentCode: "20260802-001" },
    identity: { studentId: "student-1" },
    quiz: {
      id: "biology-cell-microscope-1",
      version: 1,
      kind: "multiple-choice",
      subject: "Biology",
      title: "Biology Quiz",
    },
  });

  assert.equal(request.studentName, "王小明");
  assert.equal(request.studentCode, "20260802-001");
  assert.equal(request.studentId, "student-1");
  assert.equal(Object.hasOwn(request, "StudentName"), false);
  assert.equal(Object.hasOwn(request, "student_code"), false);
  assert.deepEqual(request.nested, {});
});

test("progress save requests whitelist sync fields and carry the cloud base revision", () => {
  assert.deepEqual(buildTrustedProgressRequest({
    progress: {
      revision: 12,
      activeAttempt: PROGRESS.activeAttempt,
      reviewProgress: {},
      StudentName: "attacker",
      extra: "must-not-send",
    },
    credentials: { studentName: "王小明", studentCode: "20260802-001" },
    quiz: { id: "biology-cell-microscope-1", version: 1 },
  }), {
    studentCode: "20260802-001",
    studentName: "王小明",
    quizId: "biology-cell-microscope-1",
    quizVersion: 1,
    baseRevision: 12,
    activeAttempt: PROGRESS.activeAttempt,
    reviewProgress: {},
  });
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
    revision: 0,
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

test("save revisions are owned by the acknowledged local snapshot", async () => {
  const storage = createMemoryStorage();
  const requests = [];
  const client = createStudentSyncClient({
    storage,
    debounceMs: 60_000,
    callSave: async (request) => {
      requests.push(request);
      return { ...PROGRESS, revision: request.baseRevision + 1 };
    },
    callSubmit: async () => ({}),
  });
  client.replaceLocalProgress({
    studentId: "student-1",
    quizId: "english-review-2",
    progress: { ...PROGRESS, revision: 7, updatedAtMs: 700 },
  });

  client.queueSave({
    studentId: "student-1",
    quizId: "english-review-2",
    progress: { ...PROGRESS, revision: 99 },
    request: { ...PROGRESS, baseRevision: 99 },
  });
  assert.equal(client.load("student-1", "english-review-2").revision, 7);
  await client.flush();

  client.queueSave({
    studentId: "student-1",
    quizId: "english-review-2",
    progress: { ...PROGRESS, revision: 0 },
    request: { ...PROGRESS, baseRevision: 0 },
  });
  await client.flush();

  assert.deepEqual(requests.map((request) => request.baseRevision), [7, 8]);
  client.dispose();
});

test("readiness never reports synced while progress or attempt work remains", async () => {
  const storage = createMemoryStorage();
  const states = [];
  const client = createStudentSyncClient({
    storage,
    debounceMs: 60_000,
    onSaveState: (state) => states.push(state.status),
    callSave: async (request) => ({ ...PROGRESS, revision: request.baseRevision + 1 }),
    callSubmit: async () => {
      throw new Error("offline");
    },
  });

  client.queueSave({
    studentId: "student-1",
    quizId: "english-review-2",
    progress: PROGRESS,
    request: PROGRESS,
  });
  assert.deepEqual(client.getReadiness("student-1", "english-review-2"), {
    status: "progress-pending",
  });
  await client.flush();
  assert.deepEqual(client.getReadiness("student-1", "english-review-2"), {
    status: "synced",
  });

  await assert.rejects(client.submit({
    studentId: "student-1",
    quizId: "english-review-2",
    submission: { attemptId: "run-1" },
    request: { attemptId: "run-1" },
  }), /offline/);
  states.length = 0;
  client.queueSave({
    studentId: "student-1",
    quizId: "english-review-2",
    progress: PROGRESS,
    request: PROGRESS,
  });
  await client.flush();

  assert.deepEqual(client.getReadiness("student-1", "english-review-2"), {
    status: "pending-attempt",
  });
  assert.equal(states.includes("synced"), false);
  client.dispose();
});

test("readiness restores pending progress from storage after dispose and reload", () => {
  const storage = createMemoryStorage();
  const firstClient = createStudentSyncClient({
    storage,
    debounceMs: 60_000,
    callSave: async () => ({}),
    callSubmit: async () => ({}),
  });
  firstClient.queueSave({
    studentId: "student-1",
    quizId: "english-review-2",
    progress: PROGRESS,
    request: PROGRESS,
  });
  firstClient.dispose();

  const reloadedClient = createStudentSyncClient({
    storage,
    debounceMs: 60_000,
    callSave: async () => ({}),
    callSubmit: async () => ({}),
  });

  assert.deepEqual(reloadedClient.getReadiness("student-1", "english-review-2"), {
    status: "progress-pending",
  });
  assert.deepEqual(reloadedClient.getReadiness("student-1", "periodic-table"), {
    status: "synced",
  });
  reloadedClient.dispose();
});

test("debounced saves report pending, acknowledged, and classified failure states", async () => {
  const storage = createMemoryStorage();
  const states = [];
  let fail = false;
  const client = createStudentSyncClient({
    storage,
    debounceMs: 60_000,
    onSaveState: (state) => states.push(state.status),
    callSave: async () => {
      if (fail) {
        throw Object.assign(new Error("offline"), { code: "functions/unavailable" });
      }
      return { ...PROGRESS, revision: 1 };
    },
    callSubmit: async () => ({}),
  });

  client.queueSave({
    studentId: "student-1",
    quizId: "english-review-2",
    progress: { ...PROGRESS, revision: 0 },
    request: { ...PROGRESS, baseRevision: 0 },
  });
  await client.flush();
  fail = true;
  client.queueSave({
    studentId: "student-1",
    quizId: "english-review-2",
    progress: { ...PROGRESS, revision: 1 },
    request: { ...PROGRESS, baseRevision: 1 },
  });
  await assert.rejects(client.flush(), /offline/);

  assert.deepEqual(states, ["pending", "synced", "pending", "error"]);
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

test("an older submission acknowledgement cannot delete a newer failed pending attempt", async () => {
  const storage = createMemoryStorage();
  const first = deferred();
  const second = deferred();
  let call = 0;
  const client = createStudentSyncClient({
    storage,
    createToken: () => `token-${call + 1}`,
    callSave: async () => ({}),
    callSubmit: () => {
      call += 1;
      return call === 1 ? first.promise : second.promise;
    },
  });

  const firstSubmit = client.submit({
    studentId: "student-1",
    quizId: "biology-cell-microscope-1",
    submission: { attemptId: "run-a", StudentName: "must-strip" },
    request: { attemptId: "run-a" },
  });
  const secondSubmit = client.submit({
    studentId: "student-1",
    quizId: "biology-cell-microscope-1",
    submission: { attemptId: "run-b", nested: { student_code: "must-strip" } },
    request: { attemptId: "run-b" },
  });

  first.resolve({ attemptId: "run-a" });
  await firstSubmit;
  second.reject(new Error("offline-b"));
  await assert.rejects(secondSubmit, /offline-b/);

  const pending = client.loadPendingAttempt(
    "student-1",
    "biology-cell-microscope-1",
  );
  assert.equal(pending.submission.attemptId, "run-b");
  assert.equal(JSON.stringify(pending).includes("must-strip"), false);
  client.dispose();
});

test("a newer success cannot erase an older active submission that later fails", async () => {
  const storage = createMemoryStorage();
  const first = deferred();
  const second = deferred();
  let call = 0;
  const client = createStudentSyncClient({
    storage,
    createToken: () => `token-${call + 1}`,
    callSave: async () => ({}),
    callSubmit: () => {
      call += 1;
      return call === 1 ? first.promise : second.promise;
    },
  });

  const firstSubmit = client.submit({
    studentId: "student-1",
    quizId: "biology-cell-microscope-1",
    submission: { attemptId: "run-a" },
    request: { attemptId: "run-a" },
  });
  const secondSubmit = client.submit({
    studentId: "student-1",
    quizId: "biology-cell-microscope-1",
    submission: { attemptId: "run-b" },
    request: { attemptId: "run-b" },
  });

  second.resolve({ attemptId: "run-b" });
  await secondSubmit;
  assert.deepEqual(client.getReadiness("student-1", "biology-cell-microscope-1"), {
    status: "pending-attempt",
  });

  first.reject(new Error("offline-a"));
  await assert.rejects(firstSubmit, /offline-a/);
  assert.equal(client.loadPendingAttempt(
    "student-1",
    "biology-cell-microscope-1",
  ).submission.attemptId, "run-a");
  assert.deepEqual(client.getReadiness("student-1", "biology-cell-microscope-1"), {
    status: "pending-attempt",
  });
  client.dispose();
});

test("a legacy single pending attempt survives a newer failed submission", async () => {
  const storage = createMemoryStorage();
  storage.setItem(
    pendingAttemptStorageKey("student-1", "biology-cell-microscope-1"),
    JSON.stringify({
      pendingToken: "legacy-token",
      submission: { attemptId: "legacy-run" },
    }),
  );
  let firstNewCall = true;
  const retried = [];
  const client = createStudentSyncClient({
    storage,
    createToken: () => "new-token",
    callSave: async () => ({}),
    callSubmit: async (request) => {
      if (request.attemptId === "run-b" && firstNewCall) {
        firstNewCall = false;
        throw new Error("offline-b");
      }
      retried.push(request.attemptId);
      return { attemptId: request.attemptId };
    },
  });

  await assert.rejects(client.submit({
    studentId: "student-1",
    quizId: "biology-cell-microscope-1",
    submission: { attemptId: "run-b" },
    request: { attemptId: "run-b" },
  }), /offline-b/);
  await client.retryPendingAttempt({
    studentId: "student-1",
    quizId: "biology-cell-microscope-1",
    buildRequest: (submission) => submission,
  });
  assert.equal(client.loadPendingAttempt(
    "student-1",
    "biology-cell-microscope-1",
  ).submission.attemptId, "run-b");
  await client.retryPendingAttempt({
    studentId: "student-1",
    quizId: "biology-cell-microscope-1",
    buildRequest: (submission) => submission,
  });

  assert.deepEqual(retried, ["legacy-run", "run-b"]);
  assert.equal(client.loadPendingAttempt(
    "student-1",
    "biology-cell-microscope-1",
  ), null);
  client.dispose();
});

test("online recovery never reports synced while an attempt is still pending", async () => {
  const storage = createMemoryStorage();
  let submitCalls = 0;
  const client = createStudentSyncClient({
    storage,
    callSave: async () => ({}),
    callSubmit: async () => {
      submitCalls += 1;
      if (submitCalls === 1) throw new Error("offline");
      return { attemptId: "run-1" };
    },
  });
  await assert.rejects(client.submit({
    studentId: "student-1",
    quizId: "biology-cell-microscope-1",
    submission: { attemptId: "run-1" },
    request: { attemptId: "run-1" },
  }), /offline/);

  assert.deepEqual(await recoverStudentSyncOnline({
    client,
    studentId: "student-1",
    quizId: "biology-cell-microscope-1",
    allowSubmitRetry: false,
    buildSubmissionRequest: () => {
      throw new Error("renderer-absent-must-not-retry");
    },
  }), { status: "pending-attempt" });
  assert.equal(submitCalls, 1);

  const recovered = await recoverStudentSyncOnline({
    client,
    studentId: "student-1",
    quizId: "biology-cell-microscope-1",
    allowSubmitRetry: true,
    buildSubmissionRequest: (submission) => submission,
  });
  assert.deepEqual(recovered, {
    status: "synced",
    recoveredSubmission: {
      result: { attemptId: "run-1" },
      submission: { attemptId: "run-1" },
    },
  });
  assert.equal(submitCalls, 2);
  client.dispose();
});

test("online recovery exposes the confirmed submission for refresh and renderer delivery", async () => {
  const storage = createMemoryStorage();
  let submitCalls = 0;
  const delivered = [];
  const client = createStudentSyncClient({
    storage,
    callSave: async () => ({}),
    callSubmit: async () => {
      submitCalls += 1;
      if (submitCalls === 1) throw new Error("offline");
      return { attemptId: "run-recovered", resultType: "score", score: 90 };
    },
  });
  client.replaceLocalProgress({
    studentId: "student-1",
    quizId: "biology-cell-microscope-1",
    progress: { revision: 7, quizVersion: 1, kind: "multiple-choice", activeAttempt: { attemptId: "run-recovered" }, reviewProgress: {} },
  });
  const pendingSubmission = {
    attemptId: "run-recovered",
    answers: { q1: "q1-o1" },
    reviewProgress: { q1: { errorCount: 1 } },
  };
  await assert.rejects(client.submit({
    studentId: "student-1",
    quizId: "biology-cell-microscope-1",
    submission: pendingSubmission,
    request: pendingSubmission,
  }), /offline/);

  const recovery = await recoverStudentSyncOnline({
    client,
    studentId: "student-1",
    quizId: "biology-cell-microscope-1",
    allowSubmitRetry: true,
    buildSubmissionRequest: (submission) => submission,
  });
  const outcome = await submitWithProgressRefresh({
    submit: async () => recovery.recoveredSubmission.result,
    refresh: () => refreshProgressAfterSubmission({
      loadProgress: async () => ({
        studentId: "student-1",
        quizId: "biology-cell-microscope-1",
        quizVersion: 1,
        kind: "multiple-choice",
        revision: 8,
        activeAttempt: null,
        reviewProgress: pendingSubmission.reviewProgress,
      }),
      client,
      credentials: { studentCode: "20260808-001", studentName: "學生一" },
      identity: { studentId: "student-1" },
      quiz: { id: "biology-cell-microscope-1", version: 1, kind: "multiple-choice" },
    }),
  });
  delivered.push({ ...recovery.recoveredSubmission, refreshError: outcome.refreshError });

  assert.equal(submitCalls, 2);
  assert.deepEqual(delivered, [{
    result: { attemptId: "run-recovered", resultType: "score", score: 90 },
    submission: pendingSubmission,
    refreshError: null,
  }]);
  assert.equal(client.load("student-1", "biology-cell-microscope-1").revision, 8);
  assert.equal(client.load("student-1", "biology-cell-microscope-1").activeAttempt, null);
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

test("disposed clients reject new submissions and keep in-flight pending data untouched", async () => {
  const storage = createMemoryStorage();
  const inFlight = deferred();
  const client = createStudentSyncClient({
    storage,
    callSave: async () => ({}),
    callSubmit: () => inFlight.promise,
  });
  const submitting = client.submit({
    studentId: "student-1",
    quizId: "biology-cell-microscope-1",
    submission: { attemptId: "run-1" },
    request: { attemptId: "run-1" },
  });
  client.dispose();
  inFlight.resolve({ attemptId: "run-1" });
  await submitting;

  assert.notEqual(client.loadPendingAttempt(
    "student-1",
    "biology-cell-microscope-1",
  ), null);
  await assert.rejects(client.submit({
    studentId: "student-1",
    quizId: "biology-cell-microscope-1",
    submission: { attemptId: "run-2" },
    request: { attemptId: "run-2" },
  }), /student-sync-client-disposed/);
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
  assert.equal(
    classifyStudentSyncError(Object.assign(new Error("progress-conflict"), {
      code: "functions/aborted",
    })),
    "progress-conflict",
  );
});

test("submission refresh makes the first retry save use the latest server revision", async () => {
  const storage = createMemoryStorage();
  const saveRequests = [];
  const client = createStudentSyncClient({
    storage,
    debounceMs: 0,
    callSave: async (request) => {
      saveRequests.push(request);
      return { revision: request.baseRevision + 1 };
    },
    callSubmit: async () => ({}),
  });
  client.replaceLocalProgress({
    studentId: "student-1",
    quizId: "biology-cell-microscope-1",
    progress: { revision: 4, quizVersion: 1, kind: "multiple-choice", activeAttempt: {}, reviewProgress: {} },
  });

  const refreshed = await refreshProgressAfterSubmission({
    loadProgress: async () => ({
      studentId: "student-1",
      quizId: "biology-cell-microscope-1",
      quizVersion: 1,
      kind: "multiple-choice",
      revision: 5,
      activeAttempt: null,
      reviewProgress: { q1: { errorCount: 1 } },
    }),
    client,
    credentials: { studentCode: "20260808-001", studentName: "學生一" },
    identity: { studentId: "student-1" },
    quiz: { id: "biology-cell-microscope-1", version: 1, kind: "multiple-choice" },
  });
  assert.equal(refreshed.revision, 5);

  const retryProgress = {
    ...refreshed,
    activeAttempt: { attemptId: "retry-1" },
  };
  client.queueSave({
    studentId: "student-1",
    quizId: "biology-cell-microscope-1",
    progress: retryProgress,
    request: buildTrustedProgressRequest({
      progress: retryProgress,
      credentials: { studentCode: "20260808-001", studentName: "學生一" },
      quiz: { id: "biology-cell-microscope-1", version: 1 },
    }),
  });
  await client.flush();

  assert.equal(saveRequests[0].baseRevision, 5);
  client.dispose();
});

test("post-submit refresh cannot write into a replaced student session", async () => {
  const client = createStudentSyncClient({
    storage: createMemoryStorage(),
    callSave: async () => ({}),
    callSubmit: async () => ({}),
  });
  client.replaceLocalProgress({
    studentId: "student-1",
    quizId: "biology-cell-microscope-1",
    progress: { revision: 4, quizVersion: 1, kind: "multiple-choice", activeAttempt: {}, reviewProgress: {} },
  });

  await assert.rejects(refreshProgressAfterSubmission({
    loadProgress: async () => ({
      studentId: "student-1",
      quizId: "biology-cell-microscope-1",
      quizVersion: 1,
      kind: "multiple-choice",
      revision: 5,
      activeAttempt: null,
      reviewProgress: {},
    }),
    client,
    credentials: { studentCode: "20260808-001", studentName: "學生一" },
    identity: { studentId: "student-1" },
    quiz: { id: "biology-cell-microscope-1", version: 1, kind: "multiple-choice" },
    isCurrent: () => false,
  }), /student-session-changed/);
  assert.equal(client.load("student-1", "biology-cell-microscope-1").revision, 4);
  client.dispose();
});

test("confirmed submission survives progress refresh failure without recreating pending data", async () => {
  const storage = createMemoryStorage();
  let submitCalls = 0;
  const client = createStudentSyncClient({
    storage,
    callSave: async () => ({}),
    callSubmit: async () => {
      submitCalls += 1;
      return { attemptId: "run-confirmed", resultType: "score", score: 80 };
    },
  });

  const outcome = await submitWithProgressRefresh({
    submit: () => client.submit({
      studentId: "student-1",
      quizId: "biology-cell-microscope-1",
      submission: { attemptId: "run-confirmed" },
      request: { attemptId: "run-confirmed" },
    }),
    refresh: async () => {
      throw new Error("refresh-offline");
    },
  });

  assert.equal(submitCalls, 1);
  assert.equal(outcome.result.attemptId, "run-confirmed");
  assert.equal(outcome.refreshedProgress, null);
  assert.match(outcome.refreshError.message, /refresh-offline/);
  assert.equal(client.loadPendingAttempt("student-1", "biology-cell-microscope-1"), null);
  client.dispose();
});
