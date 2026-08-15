import { randomBytes, randomUUID } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { createFirestoreRepository } from "./firestoreRepository.js";
import {
  confirmCommand,
  createPairingCode,
  decideRequest,
  expireStaleRequests,
  issueCommand,
  loadDashboard,
  redeemPairingCode,
  requestExtension,
  revokeDevice,
  syncDevice,
  updatePolicy,
} from "./guardianService.js";

if (getApps().length === 0) initializeApp();

export const CALLABLE_OPTIONS = Object.freeze({
  region: "us-central1",
  maxInstances: 10,
  timeoutSeconds: 30,
  memory: "256MiB",
});

const repository = createFirestoreRepository(getFirestore());
const newId = () => randomUUID();

/** Six digits from a CSPRNG — pairing codes are a credential, not a nonce. */
function newPairingCode() {
  return String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, "0");
}

const ERROR_CODES = new Map([
  ["invalid-argument", "invalid-argument"],
  ["invalid-policy", "invalid-argument"],
  ["invalid-command", "invalid-argument"],
  ["invalid-usage-session", "invalid-argument"],
  ["invalid-extension-request", "invalid-argument"],
  ["invalid-policy-evaluation", "invalid-argument"],
  ["invalid-time-zone", "invalid-argument"],
  ["invalid-time-of-day", "invalid-argument"],
  ["invalid-instant", "invalid-argument"],
  ["sign-in-required", "unauthenticated"],
  ["device-auth-required", "unauthenticated"],
  ["parent-required", "permission-denied"],
  ["device-revoked", "permission-denied"],
  ["device-child-mismatch", "permission-denied"],
  ["family-not-found", "not-found"],
  ["child-not-found", "not-found"],
  ["device-not-enrolled", "not-found"],
  ["command-not-found", "not-found"],
  ["extension-request-not-found", "not-found"],
  ["invalid-pairing-code", "not-found"],
  ["pairing-code-used", "failed-precondition"],
  ["pairing-code-expired", "deadline-exceeded"],
  ["command-not-pending", "failed-precondition"],
  ["command-device-mismatch", "permission-denied"],
  ["extension-request-not-pending", "failed-precondition"],
  ["extension-request-expired", "deadline-exceeded"],
  ["extension-budget-exhausted", "resource-exhausted"],
  ["too-many-open-requests", "resource-exhausted"],
]);

export function toCallableError(error) {
  if (error instanceof HttpsError) return error;
  const code = ERROR_CODES.get(error?.message);
  return code
    ? new HttpsError(code, error.message)
    : new HttpsError("internal", "guardian-internal-error");
}

async function run(handler) {
  try {
    return await handler();
  } catch (error) {
    throw toCallableError(error);
  }
}

/** Parent identity comes from Firebase Auth; never from the request body. */
function parentUid(request) {
  const auth = request.auth;
  if (!auth?.uid || auth.token?.role === "device") throw new Error("sign-in-required");
  return auth.uid;
}

/** Device identity comes from the custom-token claims minted at enrollment. */
function deviceClaims(request) {
  const token = request.auth?.token;
  if (!token || token.role !== "device") throw new Error("device-auth-required");
  return {
    familyId: token.familyId,
    childId: token.childId,
    deviceId: token.deviceId,
  };
}

// ---------------------------------------------------------------- parent APIs

export const guardianDashboard = onCall(CALLABLE_OPTIONS, (request) => run(async () => {
  const { familyId, days } = request.data ?? {};
  return loadDashboard(repository, {
    familyId,
    uid: parentUid(request),
    days: days ?? 7,
    nowMs: Date.now(),
  });
}));

export const guardianUpdatePolicy = onCall(CALLABLE_OPTIONS, (request) => run(async () => {
  const { familyId, childId, policy } = request.data ?? {};
  return updatePolicy(repository, {
    familyId,
    childId,
    policy,
    uid: parentUid(request),
    nowMs: Date.now(),
  });
}));

export const guardianIssueCommand = onCall(CALLABLE_OPTIONS, (request) => run(async () => {
  const { familyId, deviceId, type, minutes, note } = request.data ?? {};
  return issueCommand(repository, {
    familyId,
    deviceId,
    type,
    minutes: minutes ?? null,
    note: note ?? null,
    uid: parentUid(request),
    nowMs: Date.now(),
  }, { newId });
}));

export const guardianDecideRequest = onCall(CALLABLE_OPTIONS, (request) => run(async () => {
  const { familyId, requestId, decision, grantedMinutes, decisionNote } = request.data ?? {};
  return decideRequest(repository, {
    familyId,
    requestId,
    decision,
    grantedMinutes: grantedMinutes ?? null,
    decisionNote: decisionNote ?? null,
    uid: parentUid(request),
    nowMs: Date.now(),
  });
}));

export const guardianCreatePairingCode = onCall(CALLABLE_OPTIONS, (request) => run(async () => {
  const { familyId, childId } = request.data ?? {};
  return createPairingCode(repository, {
    familyId,
    childId,
    uid: parentUid(request),
    nowMs: Date.now(),
  }, { newCode: newPairingCode });
}));

export const guardianRevokeDevice = onCall(CALLABLE_OPTIONS, (request) => run(async () => {
  const { familyId, deviceId } = request.data ?? {};
  return revokeDevice(repository, {
    familyId,
    deviceId,
    uid: parentUid(request),
    nowMs: Date.now(),
  });
}));

// ---------------------------------------------------------------- device APIs

/**
 * Redeems a pairing code and hands back a custom token. This is the only
 * callable a device may invoke before it has an identity, so it is rate-limited
 * by the code's 15-minute, single-use lifetime.
 */
export const guardianEnrollDevice = onCall(CALLABLE_OPTIONS, (request) => run(async () => {
  const { code, platform, deviceName } = request.data ?? {};
  const claims = await redeemPairingCode(repository, {
    code,
    platform,
    deviceName: deviceName ?? null,
    nowMs: Date.now(),
  }, { newId });
  const token = await getAuth().createCustomToken(`device:${claims.deviceId}`, {
    role: "device",
    familyId: claims.familyId,
    childId: claims.childId,
    deviceId: claims.deviceId,
  });
  return { ...claims, token };
}));

export const guardianSync = onCall(CALLABLE_OPTIONS, (request) => run(async () => {
  const { sessions, platform, appVersion } = request.data ?? {};
  return syncDevice(repository, {
    claims: deviceClaims(request),
    sessions: sessions ?? [],
    platform: platform ?? null,
    appVersion: appVersion ?? null,
    nowMs: Date.now(),
  });
}));

export const guardianConfirmCommand = onCall(CALLABLE_OPTIONS, (request) => run(async () => {
  const { commandId } = request.data ?? {};
  return confirmCommand(repository, {
    claims: deviceClaims(request),
    commandId,
    nowMs: Date.now(),
  });
}));

export const guardianRequestExtension = onCall(CALLABLE_OPTIONS, (request) => run(async () => {
  const { minutes, reason } = request.data ?? {};
  return requestExtension(repository, {
    claims: deviceClaims(request),
    minutes,
    reason: reason ?? null,
    nowMs: Date.now(),
  }, { newId });
}));

// ------------------------------------------------------------------ scheduled

/**
 * Sweeps requests the parent never answered so a child is not left waiting on a
 * prompt that can no longer be approved.
 */
export const guardianExpireRequests = onSchedule(
  { schedule: "every 30 minutes", region: CALLABLE_OPTIONS.region },
  async () => {
    const nowMs = Date.now();
    const families = await getFirestore().collection("guardianFamilies").get();
    for (const familyDoc of families.docs) {
      const children = await repository.loadChildren(familyDoc.id);
      for (const child of children) {
        const policy = await repository.loadPolicy(familyDoc.id, child.childId);
        const timeZone = policy?.timeZone ?? "Asia/Taipei";
        const dateKey = new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(nowMs));
        await expireStaleRequests(repository, {
          familyId: familyDoc.id,
          childId: child.childId,
          dateKey,
          nowMs,
        });
      }
    }
  },
);
