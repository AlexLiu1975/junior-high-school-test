import { initializeApp } from "firebase/app";
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getFirebaseConfig, getMissingFirebaseConfigKeys } from "../firebaseConfig.js";
import { createDemoBackend } from "./demoBackend.js";

export const GUARDIAN_FUNCTIONS_REGION = "us-central1";

/**
 * The dashboard talks to one of two backends behind the same interface: the
 * deployed Cloud Functions, or an in-browser demo that runs the very same
 * domain code. Without Firebase credentials the app still works end to end.
 */
export function createGuardianApi({ forceDemo = false } = {}) {
  const config = getFirebaseConfig();
  const missing = getMissingFirebaseConfigKeys(config);
  if (forceDemo || missing.length > 0) return createDemoBackend();

  const app = initializeApp(config, "guardian");
  const auth = getAuth(app);
  const functions = getFunctions(app, GUARDIAN_FUNCTIONS_REGION);
  const call = (name) => httpsCallable(functions, name);

  const callers = {
    dashboard: call("guardianDashboard"),
    updatePolicy: call("guardianUpdatePolicy"),
    issueCommand: call("guardianIssueCommand"),
    decideRequest: call("guardianDecideRequest"),
    createPairingCode: call("guardianCreatePairingCode"),
    revokeDevice: call("guardianRevokeDevice"),
  };

  let familyId = null;

  return {
    mode: "firebase",
    get familyId() {
      return familyId;
    },
    setFamilyId(value) {
      familyId = value;
    },
    onAuthStateChanged: (handler) => onAuthStateChanged(auth, handler),
    signIn: () => signInWithPopup(auth, new GoogleAuthProvider()),
    signOut: () => signOut(auth),
    async loadDashboard(days = 7) {
      const result = await callers.dashboard({ familyId, days });
      return result.data;
    },
    async issueCommand(deviceId, type, options = {}) {
      const result = await callers.issueCommand({
        familyId,
        deviceId,
        type,
        minutes: options.minutes ?? null,
        note: options.note ?? null,
      });
      return result.data;
    },
    async updatePolicy(childId, policy) {
      const result = await callers.updatePolicy({ familyId, childId, policy });
      return result.data;
    },
    async decideRequest(requestId, decision, options = {}) {
      const result = await callers.decideRequest({
        familyId,
        requestId,
        decision,
        grantedMinutes: options.grantedMinutes ?? null,
        decisionNote: options.decisionNote ?? null,
      });
      return result.data;
    },
    async createPairingCode(childId) {
      const result = await callers.createPairingCode({ familyId, childId });
      return result.data;
    },
    async revokeDevice(deviceId) {
      const result = await callers.revokeDevice({ familyId, deviceId });
      return result.data;
    },
  };
}

const ERROR_MESSAGES = new Map([
  ["parent-required", "這個帳號不是這個家庭的家長。"],
  ["family-not-found", "找不到這個家庭。"],
  ["device-not-enrolled", "找不到這台裝置，可能已被移除。"],
  ["extension-request-not-pending", "這筆申請已經處理過了。"],
  ["extension-request-expired", "這筆申請已經逾時，請小孩重新提出。"],
  ["extension-budget-exhausted", "今天的加時額度已經用完了。"],
  ["too-many-open-requests", "待處理的申請太多，請先處理現有申請。"],
  ["invalid-policy", "時段設定有誤，請檢查時間是否重疊。"],
  ["pairing-code-expired", "配對碼已過期，請重新產生。"],
  ["pairing-code-used", "這個配對碼已經被使用過了。"],
]);

/** Turns a service error code into something a parent can act on. */
export function describeError(error) {
  const raw = error?.message?.replace(/^.*\//, "") ?? "";
  return ERROR_MESSAGES.get(raw) ?? "操作失敗，請稍後再試。";
}
