import { getApps, initializeApp } from "firebase-admin/app";

if (getApps().length === 0) initializeApp();

export const CALLABLE_OPTIONS = Object.freeze({
  region: "asia-east1",
  maxInstances: 3,
  timeoutSeconds: 30,
  memory: "256MiB",
});
