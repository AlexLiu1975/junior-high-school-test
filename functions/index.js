import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { createFirestoreStudentRepository } from "./firestoreStudentRepository.js";
import { maskIp } from "./ipMask.js";
import { removeOrDeactivateStudent as runStudentRemoval } from "./adminStudentService.js";
import {
  loadProgress,
  requireAnonymousAuth,
  saveProgress,
  submitAttempt,
} from "./studentService.js";

if (getApps().length === 0) initializeApp();

export const CALLABLE_OPTIONS = Object.freeze({
  region: "us-central1",
  maxInstances: 3,
  timeoutSeconds: 30,
  memory: "256MiB",
});

const repository = createFirestoreStudentRepository(getFirestore());

export function maskCallableIp(request) {
  const rawRequest = request?.rawRequest;
  const forwarded = rawRequest?.headers?.["x-forwarded-for"];
  const firstForwarded = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return maskIp(rawRequest?.ip || firstForwarded);
}

const CALLABLE_ERROR_CODES = new Map([
  ["anonymous-auth-required", "unauthenticated"],
  ["invalid-student-identity", "invalid-argument"],
  ["student-entry-not-found", "permission-denied"],
  ["student-inactive", "failed-precondition"],
  ["invalid-quiz", "invalid-argument"],
  ["invalid-progress-payload", "invalid-argument"],
  ["invalid-submission", "invalid-argument"],
  ["attempt-id-conflict", "already-exists"],
  ["progress-conflict", "aborted"],
  ["admin-required", "permission-denied"],
  ["invalid-student-id", "invalid-argument"],
]);

export function toCallableError(error) {
  if (error instanceof HttpsError) return error;
  const code = CALLABLE_ERROR_CODES.get(error?.message);
  return code
    ? new HttpsError(code, error.message)
    : new HttpsError("internal", "internal-error");
}

async function callStudentService(callback) {
  try {
    return await callback();
  } catch (error) {
    throw toCallableError(error);
  }
}

export const loadStudentProgress = onCall(CALLABLE_OPTIONS, async (request) => {
  return callStudentService(() => {
    requireAnonymousAuth(request.auth);
    return loadProgress({ repository, auth: request.auth, input: request.data });
  });
});

export const saveStudentProgress = onCall(CALLABLE_OPTIONS, async (request) => {
  return callStudentService(() => {
    requireAnonymousAuth(request.auth);
    return saveProgress({
      repository,
      auth: request.auth,
      input: request.data,
      now: Timestamp.now(),
    });
  });
});

export const submitQuizAttempt = onCall(CALLABLE_OPTIONS, async (request) => {
  return callStudentService(() => {
    requireAnonymousAuth(request.auth);
    const maskedIp = maskCallableIp(request);
    return submitAttempt({
      repository,
      auth: request.auth,
      input: request.data,
      maskedIp,
      now: Timestamp.now(),
    });
  });
});

export const removeOrDeactivateStudent = onCall(CALLABLE_OPTIONS, async (request) => {
  return callStudentService(() => runStudentRemoval({
    repository,
    auth: request.auth,
    input: request.data,
  }));
});
