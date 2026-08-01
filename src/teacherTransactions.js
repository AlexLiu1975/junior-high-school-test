import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import {
  buildAdminStudentPaths,
  buildParentApprovalPaths,
  validateAccessApplication,
} from "./teacherDomain.js";
import { planAdminStudentCreation } from "./adminStudentService.js";

export function runAdminStudentCreation({
  db,
  admin,
  studentName,
  requestedAt,
}) {
  const studentRef = doc(collection(db, "students"));

  return runTransaction(db, async (transaction) => {
    const initial = buildAdminStudentPaths({
      adminUid: admin.uid,
      studentName,
      requestedAt,
      sequence: 1,
    });
    const counterRef = doc(db, initial.counterPath);
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
    transaction.set(doc(db, paths.entryPath), writes.entry);
    transaction.set(
      doc(db, paths.linkCollectionPath, studentRef.id),
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

export function runParentApproval({ db, admin, request }) {
  const requestRef = doc(db, "accessRequests", request.uid);
  const studentRef = doc(collection(db, "students"));

  return runTransaction(db, async (transaction) => {
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
    const counterRef = doc(db, initialPaths.counterPath);
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
    transaction.set(doc(db, paths.entryPath), {
      active: true,
      studentId: studentRef.id,
    });
    transaction.set(doc(db, paths.accessPath), {
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
