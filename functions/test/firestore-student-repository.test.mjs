import assert from "node:assert/strict";
import test from "node:test";
import { createFirestoreStudentRepository } from "../firestoreStudentRepository.js";

function ref(path, key = path) {
  return {
    path,
    key,
    doc(id) { return ref(`${path}/${id}`); },
    collection(name) { return ref(`${path}/${name}`, `${path}/${name}`); },
    where(field, operator, value) {
      return ref(path, `${key}|where:${field}:${operator}:${value}`);
    },
  };
}

function document(path, data) {
  return { id: path.split("/").at(-1), ref: ref(path), data: () => structuredClone(data) };
}

function createDb({ attempts = [] } = {}) {
  const writes = { updates: [], sets: [], deletes: [], reads: [] };
  const snapshots = new Map([
    ["students/student-1", { exists: true, id: "student-1", data: () => ({
      name: "王小明", code: "20260809-001", active: true, requestUid: "parent-1",
    }) }],
    ["quizAttempts|where:studentId:==:student-1", { docs: attempts.map((item) => document(`quizAttempts/${item.id}`, item)) }],
    ["studentProgress/student-1/quizzes", { docs: [
      document("studentProgress/student-1/quizzes/biology", { activeAttempt: { attemptId: "active" }, reviewProgress: { q1: { stage: 2 } } }),
    ] }],
    ["viewerAccess|where:studentIds:array-contains:student-1", { docs: [
      document("viewerAccess/parent-1", { role: "parent", studentIds: ["student-1"] }),
    ] }],
    ["collectionGroup:students|where:studentId:==:student-1", { docs: [
      document("adminStudentLinks/admin-a/students/student-1", { studentId: "student-1" }),
      document("adminStudentLinks/admin-b/students/student-1", { studentId: "student-1" }),
      document("unrelated/record/students/student-1", { studentId: "student-1" }),
    ] }],
  ]);
  const db = {
    writes,
    collection(name) { return ref(name, name); },
    collectionGroup(name) { return ref(`collectionGroup:${name}`, `collectionGroup:${name}`); },
    async runTransaction(callback) {
      return callback({
        async get(target) {
          writes.reads.push(target.key);
          const snapshot = snapshots.get(target.key);
          if (!snapshot) throw new Error(`unexpected read: ${target.key}`);
          return snapshot;
        },
        update(target, value) { writes.updates.push([target.path, structuredClone(value)]); },
        set(target, value) { writes.sets.push([target.path, structuredClone(value)]); },
        delete(target) { writes.deletes.push(target.path); },
      });
    },
  };
  return db;
}

test("exact delete removes every admin link and parent access in one transaction", async () => {
  const db = createDb();
  const repository = createFirestoreStudentRepository(db);
  await repository.runAdminStudentTransaction("student-1", async (operation) => {
    assert.equal((await operation.getStudent()).ownerUid, undefined);
    assert.deepEqual(await operation.listAttempts(), []);
    await operation.deleteExact();
  });
  assert.deepEqual(new Set(db.writes.deletes), new Set([
    "students/student-1",
    "studentEntries/20260809-001/names/王小明",
    "studentProgress/student-1/quizzes/biology",
    "adminStudentLinks/admin-a/students/student-1",
    "adminStudentLinks/admin-b/students/student-1",
    "viewerAccess/parent-1",
  ]));
  assert.equal(db.writes.deletes.some((path) => path.startsWith("dailyCounters/")), false);
});

test("deactivation clears active progress without deleting history, access, or links", async () => {
  const db = createDb({ attempts: [{ id: "a1", studentId: "student-1", resultType: "score" }] });
  const repository = createFirestoreStudentRepository(db);
  await repository.runAdminStudentTransaction("student-1", async (operation) => {
    const progress = await operation.listProgress();
    await operation.deactivate({
      progress: progress.map((item) => ({ ...item, activeAttempt: null })),
    });
  });
  assert.deepEqual(db.writes.deletes, []);
  assert.deepEqual(db.writes.updates, [
    ["students/student-1", { active: false }],
  ]);
  assert.deepEqual(db.writes.sets, [
    ["studentEntries/20260809-001/names/王小明", { active: false, studentId: "student-1" }],
    [
      "studentProgress/student-1/quizzes/biology",
      { activeAttempt: null, reviewProgress: { q1: { stage: 2 } } },
    ],
  ]);
});
