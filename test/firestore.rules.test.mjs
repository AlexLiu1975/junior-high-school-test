import assert from "node:assert/strict";
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
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  runAdminStudentCreation,
  runParentApproval,
} from "../src/teacherTransactions.js";

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
      await setDoc(doc(db, "students/admin-student-1"), {
        name: "王小明",
        code: "20260801-001",
        active: true,
        ownerUid: "admin-uid",
        ownerType: "admin",
      });
      await setDoc(doc(db, "adminStudentLinks/admin-uid/students/admin-student-1"), {
        studentId: "admin-student-1",
      });
      await setDoc(doc(db, "adminStudentLinks/other-admin-uid/students/other-student"), {
        studentId: "other-student",
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

rulesTest("only the verified administrator manages own student links", async () => {
  const adminDb = environment
    .authenticatedContext("admin-uid", auth("admin-uid", "beyle931224@gmail.com"))
    .firestore();
  const parentDb = environment
    .authenticatedContext("parent-uid", auth("parent-uid", "parent@example.com"))
    .firestore();
  const unverifiedDb = environment
    .authenticatedContext(
      "admin-uid-2",
      auth("admin-uid-2", "beyle931224@gmail.com", false),
    )
    .firestore();

  const link = { studentId: "new-admin-student", createdAt: serverTimestamp() };
  await assertSucceeds(
    getDoc(doc(adminDb, "adminStudentLinks/admin-uid/students/admin-student-1")),
  );
  await assertSucceeds(
    setDoc(doc(adminDb, "adminStudentLinks/admin-uid/students/new-admin-student"), link),
  );
  await assertFails(
    getDoc(doc(adminDb, "adminStudentLinks/other-admin-uid/students/other-student")),
  );
  await assertFails(
    setDoc(doc(adminDb, "adminStudentLinks/other-admin-uid/students/attack"), link),
  );
  await assertFails(
    setDoc(doc(parentDb, "adminStudentLinks/parent-uid/students/attack"), link),
  );
  await assertFails(
    setDoc(doc(unverifiedDb, "adminStudentLinks/admin-uid-2/students/attack"), link),
  );
});

rulesTest("only the verified administrator creates direct student records", async () => {
  const adminDb = environment
    .authenticatedContext("admin-uid", auth("admin-uid", "beyle931224@gmail.com"))
    .firestore();
  const parentDb = environment
    .authenticatedContext("parent-uid", auth("parent-uid", "parent@example.com"))
    .firestore();
  const student = {
    name: "李小華",
    code: "20260801-002",
    active: true,
    ownerUid: "admin-uid",
    ownerType: "admin",
    createdAt: serverTimestamp(),
  };

  await assertSucceeds(setDoc(doc(adminDb, "students/new-admin-student"), student));
  await assertSucceeds(
    setDoc(doc(adminDb, "studentEntries/20260801-002/names/李小華"), {
      active: true,
      studentId: "new-admin-student",
    }),
  );
  await assertSucceeds(
    setDoc(doc(adminDb, "dailyCounters/20260801"), { nextSequence: 3 }),
  );
  await assertFails(setDoc(doc(parentDb, "students/attack"), student));
  await assertFails(
    setDoc(doc(parentDb, "studentEntries/ATTACK/names/李小華"), {
      active: true,
      studentId: "attack",
    }),
  );
  await assertFails(
    setDoc(doc(parentDb, "dailyCounters/20260801"), { nextSequence: 999 }),
  );
});

rulesTest("a rejected admin ownership link rolls back every creation write", async () => {
  const adminDb = environment
    .authenticatedContext("admin-uid", auth("admin-uid", "beyle931224@gmail.com"))
    .firestore();
  const requestedAt = new Date("2030-01-14T16:30:00.000Z");

  await assert.rejects(
    runAdminStudentCreation({
      db: adminDb,
      admin: { uid: "different-admin-uid" },
      studentName: "回滾學生",
      requestedAt,
    }),
  );

  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const students = await getDocs(
      query(collection(db, "students"), where("code", "==", "20300115-001")),
    );
    const entry = await getDoc(
      doc(db, "studentEntries/20300115-001/names/回滾學生"),
    );
    const links = await getDocs(
      collection(db, "adminStudentLinks/different-admin-uid/students"),
    );
    const counter = await getDoc(doc(db, "dailyCounters/20300115"));

    assert.equal(students.empty, true);
    assert.equal(entry.exists(), false);
    assert.equal(links.empty, true);
    assert.equal(counter.exists(), false);
  });
});

rulesTest("admin and parent creation share one contended daily sequence", async () => {
  const admin = { uid: "admin-uid" };
  const adminDb = environment
    .authenticatedContext(admin.uid, auth(admin.uid, "beyle931224@gmail.com"))
    .firestore();
  const requestedAt = new Date("2030-01-15T16:30:00.000Z");
  const parentUid = "concurrent-parent-uid";

  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "accessRequests", parentUid), {
      uid: parentUid,
      email: "concurrent-parent@example.com",
      role: "parent",
      studentName: "並行家長學生",
      status: "pending",
      requestedAt: Timestamp.fromDate(requestedAt),
    });
  });

  const [adminResult, parentResult] = await Promise.all([
    runAdminStudentCreation({
      db: adminDb,
      admin,
      studentName: "並行管理學生",
      requestedAt,
    }),
    runParentApproval({
      db: adminDb,
      admin,
      request: { uid: parentUid },
    }),
  ]);

  assert.deepEqual(
    [adminResult.studentCode, parentResult.studentCode].sort(),
    ["20300116-001", "20300116-002"],
  );

  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const adminStudent = await getDoc(doc(db, "students", adminResult.studentId));
    const parentStudent = await getDoc(doc(db, "students", parentResult.studentId));
    const adminEntry = await getDoc(
      doc(db, `studentEntries/${adminResult.studentCode}/names/並行管理學生`),
    );
    const parentEntry = await getDoc(
      doc(db, `studentEntries/${parentResult.studentCode}/names/並行家長學生`),
    );
    const adminLink = await getDoc(
      doc(db, "adminStudentLinks", admin.uid, "students", adminResult.studentId),
    );
    const parentAccess = await getDoc(doc(db, "viewerAccess", parentUid));
    const parentRequest = await getDoc(doc(db, "accessRequests", parentUid));
    const counter = await getDoc(doc(db, "dailyCounters/20300116"));

    assert.equal(adminStudent.data().code, adminResult.studentCode);
    assert.equal(parentStudent.data().code, parentResult.studentCode);
    assert.equal(adminEntry.data().studentId, adminResult.studentId);
    assert.equal(parentEntry.data().studentId, parentResult.studentId);
    assert.equal(adminLink.data().studentId, adminResult.studentId);
    assert.deepEqual(parentAccess.data().studentIds, [parentResult.studentId]);
    assert.equal(parentRequest.data().status, "approved");
    assert.equal(parentRequest.data().studentId, parentResult.studentId);
    assert.equal(counter.data().nextSequence, 3);
  });
});
