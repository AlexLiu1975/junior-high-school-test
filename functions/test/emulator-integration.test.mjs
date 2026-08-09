import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { QUIZ_CATALOG, getQuizDefinition } from "../shared/quizRegistry.js";

const PROJECT_ID = process.env.GCLOUD_PROJECT || "junior-high-school-test";
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const FUNCTIONS_HOST = process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST || "127.0.0.1:5001";
const integrationTest = AUTH_HOST && FIRESTORE_HOST ? test : test.skip;
const ADMIN_UID = "admin-integration";

let db;
let rulesEnvironment;

function hostUrl(host) {
  return host.startsWith("http") ? host : `http://${host}`;
}

async function anonymousUser() {
  const response = await fetch(
    `${hostUrl(AUTH_HOST)}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
  );
  const body = await response.text();
  assert.equal(response.ok, true, body);
  return JSON.parse(body);
}

async function googleUser({ sub, email, emailVerified = true }) {
  const idToken = JSON.stringify({ sub, email, email_verified: emailVerified });
  const postBody = new URLSearchParams({
    providerId: "google.com",
    id_token: idToken,
  }).toString();
  const response = await fetch(
    `${hostUrl(AUTH_HOST)}/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=fake-api-key`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestUri: "http://localhost", postBody, returnSecureToken: true }),
    },
  );
  const body = await response.text();
  assert.equal(response.ok, true, body);
  return JSON.parse(body);
}

async function callable(name, token, data, { expectedStatus = 200 } = {}) {
  const response = await fetch(
    `${hostUrl(FUNCTIONS_HOST)}/${PROJECT_ID}/asia-east1/${name}`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ data }),
    },
  );
  const payload = await response.json();
  assert.equal(response.status, expectedStatus, JSON.stringify(payload));
  return payload.result ?? payload.error;
}

function identity(student) {
  return { studentCode: student.code, studentName: student.name };
}

async function seedStudent({ studentId, code, name, adminUids = [] }) {
  const student = { studentId, code, name };
  await Promise.all([
    db.collection("students").doc(studentId).set({ code, name, active: true }),
    db.collection("studentEntries").doc(code).collection("names").doc(name)
      .set({ studentId, active: true }),
    ...adminUids.map((uid) => db.collection("adminStudentLinks").doc(uid)
      .collection("students").doc(studentId).set({ studentId })),
  ]);
  return student;
}

function multipleChoiceAttempt(definition, attemptId) {
  const questionOrder = definition.questions.map(({ id }) => id);
  return {
    attemptId,
    questionOrder,
    optionOrder: Object.fromEntries(definition.questions.map((question) => [
      question.id,
      question.options.map(({ id }) => id),
    ])),
    answers: Object.fromEntries(definition.questions.map((question) => [
      question.id,
      question.options.find(({ correct }) => correct).id,
    ])),
    currentQuestionIndex: 0,
  };
}

function placementAttempt(definition, attemptId) {
  return {
    attemptId,
    poolOrder: definition.elements.map(({ id }) => id),
    placedElementIds: definition.elements.slice(0, 2).map(({ id }) => id),
    errorCount: 2,
    accumulatedSeconds: 30,
    timerState: "paused",
  };
}

function submissionFor(definition, activeAttempt) {
  if (definition.kind === "multiple-choice") {
    const { attemptId, questionOrder, optionOrder, answers } = activeAttempt;
    return { attemptId, questionOrder, optionOrder, answers, reviewProgress: {} };
  }
  return {
    attemptId: activeAttempt.attemptId,
    placements: Object.fromEntries(definition.elements.map(({ id, targetId }) => [id, targetId])),
    errorCount: activeAttempt.errorCount,
    durationSeconds: activeAttempt.accumulatedSeconds,
  };
}

before(async () => {
  if (!AUTH_HOST || !FIRESTORE_HOST) return;
  if (getApps().length === 0) initializeApp({ projectId: PROJECT_ID });
  db = getFirestore();
  const [firestoreHostname, firestorePort] = FIRESTORE_HOST.split(":");
  rulesEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { host: firestoreHostname, port: Number(firestorePort) },
  });
});

after(async () => {
  await rulesEnvironment?.cleanup();
});

integrationTest("all three quizzes restore on a second anonymous user and retry to one public/private pair", async () => {
  const first = await anonymousUser();
  const second = await anonymousUser();

  for (const [index, catalogItem] of QUIZ_CATALOG.entries()) {
    const definition = getQuizDefinition(catalogItem.id, catalogItem.version);
    const student = await seedStudent({
      studentId: `restore-${index}-${randomUUID()}`,
      code: `20260809-${String(index + 1).padStart(3, "0")}`,
      name: `還原測試${index + 1}`,
    });
    const attemptId = `restore_${index}_${randomUUID().replaceAll("-", "")}`;
    const activeAttempt = definition.kind === "multiple-choice"
      ? multipleChoiceAttempt(definition, attemptId)
      : placementAttempt(definition, attemptId);
    const common = {
      ...identity(student),
      quizId: definition.id,
      quizVersion: definition.version,
    };

    const saved = await callable("saveStudentProgress", first.idToken, {
      ...common,
      baseRevision: 0,
      activeAttempt,
      reviewProgress: {},
    });
    assert.equal(saved.revision, 1);

    const restored = await callable("loadStudentProgress", second.idToken, common);
    assert.deepEqual(restored.activeAttempt, activeAttempt);

    const submission = { ...common, ...submissionFor(definition, activeAttempt) };
    const firstResult = await callable("submitQuizAttempt", second.idToken, submission);
    const retryResult = await callable("submitQuizAttempt", second.idToken, submission);
    assert.deepEqual(retryResult, firstResult);

    const [publicSnapshot, privateSnapshot] = await Promise.all([
      db.collection("quizAttempts").where("studentId", "==", student.studentId).get(),
      db.collection("attemptPrivate").doc(attemptId).get(),
    ]);
    assert.equal(publicSnapshot.size, 1);
    assert.equal(publicSnapshot.docs[0].id, attemptId);
    assert.equal(privateSnapshot.exists, true);
    assert.match(privateSnapshot.data().maskedIp, /(?:xxx|unknown|無法判定)$/);
  }
});

integrationTest("cross-kind submission is rejected before writing either attempt record", async () => {
  const user = await anonymousUser();
  const student = await seedStudent({
    studentId: `cross-kind-${randomUUID()}`,
    code: "20260809-010",
    name: "跨類型測試",
  });
  const attemptId = `cross_${randomUUID().replaceAll("-", "")}`;
  const error = await callable("submitQuizAttempt", user.idToken, {
    ...identity(student),
    attemptId,
    quizId: "biology-cell-microscope-1",
    quizVersion: 1,
    placements: {},
    errorCount: 0,
    durationSeconds: 1,
  }, { expectedStatus: 400 });
  assert.equal(error.status, "INVALID_ARGUMENT");
  assert.equal((await db.collection("quizAttempts").doc(attemptId).get()).exists, false);
  assert.equal((await db.collection("attemptPrivate").doc(attemptId).get()).exists, false);
});

integrationTest("teacher and parent cannot read private IP while admin can list every student", async () => {
  const student = await seedStudent({
    studentId: `privacy-${randomUUID()}`,
    code: "20260809-020",
    name: "隱私測試",
  });
  const privateId = `private_${randomUUID().replaceAll("-", "")}`;
  await Promise.all([
    db.collection("attemptPrivate").doc(privateId).set({ maskedIp: "203.0.113.xxx" }),
    db.collection("viewerAccess").doc("teacher-integration").set({ role: "teacher", studentIds: [] }),
    db.collection("viewerAccess").doc("parent-integration").set({
      role: "parent", studentIds: [student.studentId],
    }),
  ]);
  const googleClaims = (email) => ({
    email,
    email_verified: true,
    firebase: { sign_in_provider: "google.com" },
  });
  const teacherDb = rulesEnvironment.authenticatedContext(
    "teacher-integration", googleClaims("teacher@example.com"),
  ).firestore();
  const parentDb = rulesEnvironment.authenticatedContext(
    "parent-integration", googleClaims("parent@example.com"),
  ).firestore();
  const adminDb = rulesEnvironment.authenticatedContext(
    ADMIN_UID, googleClaims("beyle931224@gmail.com"),
  ).firestore();

  await assert.rejects(getDoc(doc(teacherDb, "attemptPrivate", privateId)));
  await assert.rejects(getDoc(doc(parentDb, "attemptPrivate", privateId)));
  assert.equal((await getDocs(collection(adminDb, "students"))).empty, false);
});

integrationTest("safe removal deletes no-attempt students and all admin links", async () => {
  const admin = await googleUser({
    sub: ADMIN_UID,
    email: "beyle931224@gmail.com",
  });
  const nonAdmin = await anonymousUser();
  const student = await seedStudent({
    studentId: `delete-${randomUUID()}`,
    code: "20260809-030",
    name: "刪除測試",
    adminUids: [ADMIN_UID, "second-admin"],
  });
  await Promise.all([
    db.collection("studentProgress").doc(student.studentId).collection("quizzes")
      .doc("periodic-table").set({ activeAttempt: { attemptId: "draft" }, reviewProgress: {} }),
    db.collection("viewerAccess").doc("parent-delete-only").set({
      role: "parent", studentIds: [student.studentId],
    }),
    db.collection("viewerAccess").doc("parent-delete-shared").set({
      role: "parent", studentIds: [student.studentId, "student-kept"],
    }),
  ]);

  const denied = await callable(
    "removeOrDeactivateStudent",
    nonAdmin.idToken,
    { studentId: student.studentId },
    { expectedStatus: 403 },
  );
  assert.equal(denied.status, "PERMISSION_DENIED");
  const invalid = await callable(
    "removeOrDeactivateStudent",
    admin.idToken,
    { studentId: "../invalid" },
    { expectedStatus: 400 },
  );
  assert.equal(invalid.status, "INVALID_ARGUMENT");
  assert.deepEqual(
    await callable("removeOrDeactivateStudent", admin.idToken, { studentId: student.studentId }),
    { status: "deleted" },
  );
  const snapshots = await Promise.all([
    db.collection("students").doc(student.studentId).get(),
    db.collection("studentEntries").doc(student.code).collection("names").doc(student.name).get(),
    db.collection("adminStudentLinks").doc(ADMIN_UID).collection("students").doc(student.studentId).get(),
    db.collection("adminStudentLinks").doc("second-admin").collection("students").doc(student.studentId).get(),
    db.collection("studentProgress").doc(student.studentId).collection("quizzes").get(),
    db.collection("viewerAccess").doc("parent-delete-only").get(),
    db.collection("viewerAccess").doc("parent-delete-shared").get(),
  ]);
  assert.equal(snapshots.slice(0, 4).every((snapshot) => !snapshot.exists), true);
  assert.equal(snapshots[4].empty, true);
  assert.equal(snapshots[5].exists, false);
  assert.deepEqual(snapshots[6].data().studentIds, ["student-kept"]);
});

integrationTest("any completed quiz deactivates the student and preserves its attempt pair", async () => {
  const admin = await googleUser({
    sub: `${ADMIN_UID}-deactivate`,
    email: "beyle931224@gmail.com",
  });
  const student = await seedStudent({
    studentId: `deactivate-${randomUUID()}`,
    code: "20260809-040",
    name: "停用測試",
    adminUids: [ADMIN_UID, "second-admin"],
  });
  const attemptId = `kept_${randomUUID().replaceAll("-", "")}`;
  await Promise.all([
    db.collection("quizAttempts").doc(attemptId).set({
      studentId: student.studentId, resultType: "placement", completed: true,
    }),
    db.collection("attemptPrivate").doc(attemptId).set({ maskedIp: "198.51.100.xxx" }),
    db.collection("studentProgress").doc(student.studentId).collection("quizzes")
      .doc("biology-cell-microscope-1").set({
        activeAttempt: { attemptId: "unfinished" },
        reviewProgress: { q1: { stage: 2, marker: "preserve" } },
      }),
    db.collection("viewerAccess").doc("parent-deactivate").set({
      role: "parent", studentIds: [student.studentId],
    }),
  ]);

  assert.deepEqual(
    await callable("removeOrDeactivateStudent", admin.idToken, { studentId: student.studentId }),
    { status: "deactivated" },
  );
  const [studentSnapshot, entrySnapshot, publicSnapshot, privateSnapshot, progressSnapshot,
    firstLink, secondLink, parentAccess] = await Promise.all([
    db.collection("students").doc(student.studentId).get(),
    db.collection("studentEntries").doc(student.code).collection("names").doc(student.name).get(),
    db.collection("quizAttempts").doc(attemptId).get(),
    db.collection("attemptPrivate").doc(attemptId).get(),
    db.collection("studentProgress").doc(student.studentId).collection("quizzes")
      .doc("biology-cell-microscope-1").get(),
    db.collection("adminStudentLinks").doc(ADMIN_UID).collection("students").doc(student.studentId).get(),
    db.collection("adminStudentLinks").doc("second-admin").collection("students").doc(student.studentId).get(),
    db.collection("viewerAccess").doc("parent-deactivate").get(),
  ]);
  assert.equal(studentSnapshot.data().active, false);
  assert.equal(entrySnapshot.data().active, false);
  assert.equal(publicSnapshot.exists, true);
  assert.equal(privateSnapshot.exists, true);
  assert.equal(progressSnapshot.data().activeAttempt, null);
  assert.deepEqual(progressSnapshot.data().reviewProgress, { q1: { stage: 2, marker: "preserve" } });
  assert.equal(firstLink.exists, true);
  assert.equal(secondLink.exists, true);
  assert.deepEqual(parentAccess.data().studentIds, [student.studentId]);
});

integrationTest("submit racing safe removal never creates an orphan attempt record", async () => {
  const user = await anonymousUser();
  const admin = await googleUser({
    sub: `${ADMIN_UID}-race`,
    email: "beyle931224@gmail.com",
  });
  const student = await seedStudent({
    studentId: `race-${randomUUID()}`,
    code: "20260809-050",
    name: "競態測試",
  });
  const definition = getQuizDefinition("biology-cell-microscope-1", 1);
  const attempt = multipleChoiceAttempt(definition, `race_${randomUUID().replaceAll("-", "")}`);
  const submission = {
    ...identity(student),
    quizId: definition.id,
    quizVersion: definition.version,
    ...submissionFor(definition, attempt),
  };

  const [submitOutcome, removeOutcome] = await Promise.allSettled([
    callable("submitQuizAttempt", user.idToken, submission),
    callable("removeOrDeactivateStudent", admin.idToken, { studentId: student.studentId }),
  ]);
  assert.equal(removeOutcome.status, "fulfilled");
  const [publicSnapshot, privateSnapshot] = await Promise.all([
    db.collection("quizAttempts").doc(attempt.attemptId).get(),
    db.collection("attemptPrivate").doc(attempt.attemptId).get(),
  ]);
  assert.equal(publicSnapshot.exists, privateSnapshot.exists);
  if (submitOutcome.status === "fulfilled") {
    assert.equal(publicSnapshot.exists, true);
    assert.deepEqual(removeOutcome.value, { status: "deactivated" });
  } else {
    assert.equal(publicSnapshot.exists, false);
    assert.deepEqual(removeOutcome.value, { status: "deleted" });
  }
});
