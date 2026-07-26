import { initializeApp } from "firebase/app";
import {
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
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import {
  getFirebaseConfig,
  getMissingFirebaseConfigKeys,
} from "./firebaseConfig.js";
import { validateAccessApplication } from "./teacherDomain.js";

const firebaseConfig = getFirebaseConfig();
const missingConfigKeys = getMissingFirebaseConfigKeys(firebaseConfig);
const teacherApp =
  missingConfigKeys.length === 0
    ? initializeApp(firebaseConfig, "teacher-portal")
    : null;
const teacherAuth = teacherApp
  ? initializeAuth(teacherApp, { persistence: inMemoryPersistence })
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
