import { initializeApp } from "firebase/app";
import {
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  inMemoryPersistence,
  initializeAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  writeBatch,
  where,
} from "firebase/firestore";
import {
  getFirebaseConfig,
  getMissingFirebaseConfigKeys,
} from "./firebaseConfig.js";
import {
  buildAdminStudentPaths,
  buildParentApprovalPaths,
  buildTeacherAccess,
  validateAccessApplication,
} from "./teacherDomain.js";
import { planAdminStudentCreation } from "./adminStudentService.js";

const firebaseConfig = getFirebaseConfig();
const missingConfigKeys = getMissingFirebaseConfigKeys(firebaseConfig);
const teacherApp =
  missingConfigKeys.length === 0
    ? initializeApp(firebaseConfig, "teacher-portal")
    : null;

export function getTeacherAuthOptions() {
  return {
    persistence: inMemoryPersistence,
    popupRedirectResolver: browserPopupRedirectResolver,
  };
}

const teacherAuth = teacherApp
  ? initializeAuth(teacherApp, getTeacherAuthOptions())
  : null;
const teacherDb = teacherApp ? getFirestore(teacherApp) : null;
const provider = new GoogleAuthProvider();

function requireTeacherFirebase() {
  if (!teacherApp) {
    throw new Error(
      `Firebase configuration is missing: ${missingConfigKeys.join(", ")}`,
    );
  }
}

export function onTeacherAuthStateChanged(callback) {
  requireTeacherFirebase();
  return onAuthStateChanged(teacherAuth, callback);
}

export async function signInTeacher() {
  requireTeacherFirebase();
  const result = await signInWithPopup(teacherAuth, provider);
  return result.user;
}

export async function signOutTeacher() {
  requireTeacherFirebase();
  await signOut(teacherAuth);
}

export async function loadOwnAccess(uid) {
  requireTeacherFirebase();
  const [requestSnapshot, accessSnapshot] = await Promise.all([
    getDoc(doc(teacherDb, "accessRequests", uid)),
    getDoc(doc(teacherDb, "viewerAccess", uid)),
  ]);
  return {
    request: requestSnapshot.exists() ? requestSnapshot.data() : null,
    access: accessSnapshot.exists() ? accessSnapshot.data() : null,
  };
}

export async function submitAccessRequest({ user, role, studentName }) {
  requireTeacherFirebase();
  const checked = validateAccessApplication({ role, studentName });
  if (!checked.valid) throw new Error("invalid-access-request");
  await setDoc(doc(teacherDb, "accessRequests", user.uid), {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName ?? "",
    role: checked.role,
    studentName: checked.studentName,
    status: "pending",
    requestedAt: serverTimestamp(),
    reviewedAt: null,
    reviewedBy: null,
  });
}

const newestFirst = (left, right) => {
  const leftMs = left.submittedAt?.toMillis?.() ?? 0;
  const rightMs = right.submittedAt?.toMillis?.() ?? 0;
  return rightMs - leftMs;
};

export async function listAttemptsForAccess(access, isAdmin = false) {
  requireTeacherFirebase();
  let attemptsQuery;
  if (isAdmin || access?.role === "teacher") {
    attemptsQuery = query(
      collection(teacherDb, "quizAttempts"),
      orderBy("submittedAt", "desc"),
    );
  } else if (access?.role === "parent" && access.studentIds?.length > 0) {
    attemptsQuery = query(
      collection(teacherDb, "quizAttempts"),
      where("studentId", "in", access.studentIds),
    );
  } else {
    return [];
  }
  const snapshot = await getDocs(attemptsQuery);
  return snapshot.docs
    .map((attempt) => ({ id: attempt.id, ...attempt.data() }))
    .sort(newestFirst);
}

export async function listStudentsForAccess(access) {
  requireTeacherFirebase();
  if (access?.role !== "parent") return [];
  const snapshots = await Promise.all(
    (access.studentIds ?? []).map((studentId) =>
      getDoc(doc(teacherDb, "students", studentId)),
    ),
  );
  return snapshots
    .filter((snapshot) => snapshot.exists())
    .map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }));
}

function requireAdmin() {
  requireTeacherFirebase();
  const user = teacherAuth.currentUser;
  if (!user || user.email !== "beyle931224@gmail.com" || !user.emailVerified) {
    throw new Error("admin-required");
  }
  return user;
}

export async function createAdminStudent(studentName) {
  const admin = requireAdmin();
  const studentRef = doc(collection(teacherDb, "students"));
  const requestedAt = new Date();
  return runTransaction(teacherDb, async (transaction) => {
    const initial = buildAdminStudentPaths({
      adminUid: admin.uid,
      studentName,
      requestedAt,
      sequence: 1,
    });
    const counterRef = doc(teacherDb, initial.counterPath);
    const counterSnapshot = await transaction.get(counterRef);
    const sequence = counterSnapshot.exists()
      ? (counterSnapshot.data().nextSequence ?? 1)
      : 1;
    const paths = buildAdminStudentPaths({
      adminUid: admin.uid,
      studentName,
      requestedAt,
      sequence,
    });
    const writes = planAdminStudentCreation({
      adminUid: admin.uid,
      studentId: studentRef.id,
      studentName: paths.studentName,
      studentCode: paths.studentCode,
      sequence,
    });
    transaction.set(studentRef, {
      ...writes.student,
      createdAt: serverTimestamp(),
    });
    transaction.set(doc(teacherDb, paths.entryPath), writes.entry);
    transaction.set(
      doc(teacherDb, paths.linkCollectionPath, studentRef.id),
      { ...writes.link, createdAt: serverTimestamp() },
    );
    transaction.set(counterRef, { nextSequence: writes.nextSequence });
    return {
      studentId: studentRef.id,
      studentName: paths.studentName,
      studentCode: paths.studentCode,
    };
  });
}

export async function listAdminStudents() {
  const admin = requireAdmin();
  const links = await getDocs(
    collection(teacherDb, "adminStudentLinks", admin.uid, "students"),
  );
  const snapshots = await Promise.all(
    links.docs.map((link) => getDoc(doc(teacherDb, "students", link.id))),
  );
  return snapshots
    .filter((snapshot) => snapshot.exists())
    .map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }));
}

export async function listAttemptsForStudentIds(studentIds) {
  requireAdmin();
  if (studentIds.length === 0) return [];
  const chunks = [];
  for (let index = 0; index < studentIds.length; index += 30) {
    chunks.push(studentIds.slice(index, index + 30));
  }
  const snapshots = await Promise.all(
    chunks.map((ids) =>
      getDocs(
        query(
          collection(teacherDb, "quizAttempts"),
          where("studentId", "in", ids),
        ),
      ),
    ),
  );
  return snapshots
    .flatMap((snapshot) =>
      snapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
    )
    .sort(newestFirst);
}

export function subscribeToPendingRequests(callback) {
  requireAdmin();
  return onSnapshot(
    query(
      collection(teacherDb, "accessRequests"),
      where("status", "==", "pending"),
    ),
    (snapshot) =>
      callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
  );
}

export async function approveTeacher(request) {
  const admin = requireAdmin();
  const batch = writeBatch(teacherDb);
  batch.set(
    doc(teacherDb, "viewerAccess", request.uid),
    { ...buildTeacherAccess(request), approvedAt: serverTimestamp(), approvedBy: admin.uid },
  );
  batch.update(doc(teacherDb, "accessRequests", request.uid), {
    status: "approved",
    reviewedAt: serverTimestamp(),
    reviewedBy: admin.uid,
  });
  await batch.commit();
}

export async function approveParent(request) {
  const admin = requireAdmin();
  const requestRef = doc(teacherDb, "accessRequests", request.uid);
  const studentRef = doc(collection(teacherDb, "students"));

  return runTransaction(teacherDb, async (transaction) => {
    const requestSnapshot = await transaction.get(requestRef);
    if (!requestSnapshot.exists()) throw new Error("request-not-found");
    const storedRequest = requestSnapshot.data();
    if (storedRequest.status === "approved") {
      return {
        studentId: storedRequest.studentId,
        studentCode: storedRequest.studentCode,
      };
    }
    if (storedRequest.status !== "pending" || storedRequest.role !== "parent") {
      throw new Error("request-not-pending-parent");
    }

    const initialPaths = buildParentApprovalPaths({
      request: storedRequest,
      sequence: 1,
    });
    const counterRef = doc(teacherDb, initialPaths.counterPath);
    const counterSnapshot = await transaction.get(counterRef);
    const sequence = counterSnapshot.exists()
      ? (counterSnapshot.data().nextSequence ?? 1)
      : 1;
    const paths = buildParentApprovalPaths({
      request: storedRequest,
      sequence,
    });
    const studentName = validateAccessApplication({
      role: "parent",
      studentName: storedRequest.studentName,
    }).studentName;

    transaction.set(studentRef, {
      name: studentName,
      code: paths.studentCode,
      active: true,
      createdAt: serverTimestamp(),
      requestUid: storedRequest.uid,
    });
    transaction.set(doc(teacherDb, paths.entryPath), {
      active: true,
      studentId: studentRef.id,
    });
    transaction.set(doc(teacherDb, paths.accessPath), {
      uid: storedRequest.uid,
      role: "parent",
      studentIds: [studentRef.id],
      approvedAt: serverTimestamp(),
      approvedBy: admin.uid,
    });
    transaction.set(counterRef, { nextSequence: sequence + 1 });
    transaction.update(requestRef, {
      status: "approved",
      studentId: studentRef.id,
      studentCode: paths.studentCode,
      reviewedAt: serverTimestamp(),
      reviewedBy: admin.uid,
    });
    return { studentId: studentRef.id, studentCode: paths.studentCode };
  });
}

export async function rejectRequest(request) {
  const admin = requireAdmin();
  const batch = writeBatch(teacherDb);
  batch.update(doc(teacherDb, "accessRequests", request.uid), {
    status: "rejected",
    reviewedAt: serverTimestamp(),
    reviewedBy: admin.uid,
  });
  await batch.commit();
}
