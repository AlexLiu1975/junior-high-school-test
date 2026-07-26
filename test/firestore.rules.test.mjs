import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

let environment;
const emulatorAvailable = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const rulesTest = emulatorAvailable ? test : test.skip;

const auth = (_uid, email, emailVerified = true) => ({
  email,
  email_verified: emailVerified,
  firebase: { sign_in_provider: "google.com" },
});

if (emulatorAvailable) {
  before(async () => {
    environment = await initializeTestEnvironment({
      projectId: "junior-high-school-test",
      firestore: { rules: await readFile("firestore.rules", "utf8") },
    });
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "studentEntries/20260726-001/names/王小明"), {
        active: true,
        studentId: "student-1",
      });
      await setDoc(doc(db, "viewerAccess/parent-uid"), {
        uid: "parent-uid",
        role: "parent",
        studentIds: ["student-1"],
      });
      await setDoc(doc(db, "viewerAccess/teacher-uid"), {
        uid: "teacher-uid",
        role: "teacher",
        studentIds: [],
      });
      await setDoc(doc(db, "quizAttempts/existing-student-1"), {
        studentId: "student-1",
        studentUid: "student-uid",
      });
      await setDoc(doc(db, "quizAttempts/existing-student-2"), {
        studentId: "student-2",
        studentUid: "other-student",
      });
      await setDoc(doc(db, "accessRequests/parent-uid"), {
        uid: "parent-uid",
        email: "parent@example.com",
        role: "parent",
        studentName: "王小明",
        status: "pending",
      });
    });
  });

  after(async () => {
    await environment?.cleanup();
  });
}

rulesTest("student may create one valid owned attempt but cannot mutate it", async () => {
  const studentDb = environment
    .authenticatedContext("student-uid", auth("student-uid", "student@example.com"))
    .firestore();
  const attackerDb = environment
    .authenticatedContext("attacker-uid", auth("attacker-uid", "attacker@example.com"))
    .firestore();
  const validAttempt = {
    quizId: "quiz-1",
    quizTitle: "試卷",
    studentUid: "student-uid",
    studentId: "student-1",
    studentCode: "20260726-001",
    studentName: "王小明",
    score: 80,
    correctCount: 16,
    wrongCount: 4,
    submittedAt: serverTimestamp(),
  };
  await assertSucceeds(setDoc(doc(studentDb, "quizAttempts/new-attempt"), validAttempt));
  await assertFails(setDoc(doc(attackerDb, "quizAttempts/attack"), validAttempt));
  await assertFails(updateDoc(doc(studentDb, "quizAttempts/new-attempt"), { score: 100 }));
  await assertFails(deleteDoc(doc(studentDb, "quizAttempts/new-attempt")));
});

rulesTest("record reads obey pending, teacher, and parent scopes", async () => {
  const pendingDb = environment
    .authenticatedContext("pending-uid", auth("pending-uid", "pending@example.com"))
    .firestore();
  const teacherDb = environment
    .authenticatedContext("teacher-uid", auth("teacher-uid", "teacher@example.com"))
    .firestore();
  const parentDb = environment
    .authenticatedContext("parent-uid", auth("parent-uid", "parent@example.com"))
    .firestore();

  await assertFails(getDocs(collection(pendingDb, "quizAttempts")));
  await assertSucceeds(getDocs(collection(teacherDb, "quizAttempts")));
  await assertSucceeds(
    getDocs(query(collection(parentDb, "quizAttempts"), where("studentId", "==", "student-1"))),
  );
  await assertFails(getDocs(collection(parentDb, "quizAttempts")));
  await assertFails(
    getDocs(query(collection(parentDb, "quizAttempts"), where("studentId", "==", "student-2"))),
  );
});

rulesTest("only verified administrator may approve access", async () => {
  const pendingDb = environment
    .authenticatedContext("parent-uid", auth("parent-uid", "parent@example.com"))
    .firestore();
  const adminDb = environment
    .authenticatedContext("admin-uid", auth("admin-uid", "beyle931224@gmail.com"))
    .firestore();
  const unverifiedAdminDb = environment
    .authenticatedContext(
      "admin-uid-2",
      auth("admin-uid-2", "beyle931224@gmail.com", false),
    )
    .firestore();
  const parentAccess = {
    uid: "parent-uid",
    role: "parent",
    studentIds: ["student-1"],
  };

  await assertFails(updateDoc(doc(pendingDb, "accessRequests/parent-uid"), { status: "approved" }));
  await assertSucceeds(setDoc(doc(adminDb, "viewerAccess/another-parent"), parentAccess));
  await assertFails(setDoc(doc(unverifiedAdminDb, "viewerAccess/another-parent"), parentAccess));
});
