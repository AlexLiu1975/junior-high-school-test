import { isDateKey, isInstant } from "./time.js";

export const MIN_REQUEST_MINUTES = 5;
export const MAX_REQUEST_MINUTES = 120;
export const MAX_BONUS_MINUTES_PER_DAY = 180;
export const REQUEST_EXPIRY_MS = 60 * 60 * 1000;
export const MAX_OPEN_REQUESTS_PER_DAY = 5;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const MAX_REASON_LENGTH = 200;

function invalidRequest() {
  throw new Error("invalid-extension-request");
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isId(value) {
  return typeof value === "string" && ID_PATTERN.test(value);
}

function normalizeReason(reason) {
  if (reason === undefined || reason === null || reason === "") return null;
  if (typeof reason !== "string" || reason.length > MAX_REASON_LENGTH) invalidRequest();
  const trimmed = reason.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** A child-initiated ask for extra minutes on one local day. */
export function createExtensionRequest({
  requestId,
  childId,
  deviceId,
  dateKey,
  minutes,
  reason,
  createdAtMs,
}) {
  if (!isId(requestId) || !isId(childId) || !isId(deviceId)) invalidRequest();
  if (!isDateKey(dateKey) || !isInstant(createdAtMs)) invalidRequest();
  if (
    !Number.isInteger(minutes)
    || minutes < MIN_REQUEST_MINUTES
    || minutes > MAX_REQUEST_MINUTES
  ) {
    invalidRequest();
  }
  return Object.freeze({
    requestId,
    childId,
    deviceId,
    dateKey,
    minutes,
    reason: normalizeReason(reason),
    status: "pending",
    createdAtMs,
    expiresAtMs: createdAtMs + REQUEST_EXPIRY_MS,
    decidedAtMs: null,
    decidedByUid: null,
    grantedMinutes: 0,
    decisionNote: null,
  });
}

export function isRequestExpired(request, nowMs) {
  if (!isRecord(request) || !isInstant(nowMs)) invalidRequest();
  return request.status === "pending" && nowMs >= request.expiresAtMs;
}

/**
 * Applies a parent decision. The parent may grant fewer minutes than asked;
 * `grantedMinutes` is clamped by the remaining daily bonus budget so approvals
 * can never exceed MAX_BONUS_MINUTES_PER_DAY however many requests arrive.
 */
export function decideExtensionRequest(request, {
  decision,
  decidedByUid,
  decidedAtMs,
  grantedMinutes,
  decisionNote,
  bonusAlreadyGrantedMinutes = 0,
}) {
  if (!isRecord(request)) invalidRequest();
  if (!isId(decidedByUid) || !isInstant(decidedAtMs)) invalidRequest();
  if (!["approved", "denied"].includes(decision)) invalidRequest();
  if (request.status !== "pending") throw new Error("extension-request-not-pending");
  if (decidedAtMs < request.createdAtMs) invalidRequest();
  if (isRequestExpired(request, decidedAtMs)) throw new Error("extension-request-expired");
  if (
    !Number.isInteger(bonusAlreadyGrantedMinutes)
    || bonusAlreadyGrantedMinutes < 0
    || bonusAlreadyGrantedMinutes > MAX_BONUS_MINUTES_PER_DAY
  ) {
    invalidRequest();
  }

  if (decision === "denied") {
    return Object.freeze({
      ...request,
      status: "denied",
      decidedAtMs,
      decidedByUid,
      grantedMinutes: 0,
      decisionNote: normalizeReason(decisionNote),
    });
  }

  const requested = grantedMinutes === undefined || grantedMinutes === null
    ? request.minutes
    : grantedMinutes;
  if (
    !Number.isInteger(requested)
    || requested < MIN_REQUEST_MINUTES
    || requested > MAX_REQUEST_MINUTES
  ) {
    invalidRequest();
  }
  const budget = MAX_BONUS_MINUTES_PER_DAY - bonusAlreadyGrantedMinutes;
  if (budget <= 0) throw new Error("extension-budget-exhausted");
  return Object.freeze({
    ...request,
    status: "approved",
    decidedAtMs,
    decidedByUid,
    grantedMinutes: Math.min(requested, budget),
    decisionNote: normalizeReason(decisionNote),
  });
}

export function expireRequest(request, nowMs) {
  if (!isRequestExpired(request, nowMs)) return request;
  return Object.freeze({ ...request, status: "expired", decidedAtMs: nowMs });
}

/** Bonus minutes unlocked for one local day by all approved requests. */
export function bonusMinutesForDate(requests, dateKey) {
  if (!Array.isArray(requests)) invalidRequest();
  if (!isDateKey(dateKey)) invalidRequest();
  const total = requests
    .filter((request) => request.status === "approved" && request.dateKey === dateKey)
    .reduce((sum, request) => sum + request.grantedMinutes, 0);
  return Math.min(total, MAX_BONUS_MINUTES_PER_DAY);
}

export function pendingRequests(requests, nowMs) {
  if (!Array.isArray(requests)) invalidRequest();
  return requests.filter((request) => request.status === "pending" && !isRequestExpired(request, nowMs));
}

/** Guards against a child spamming the parent with requests. */
export function canOpenRequest(requests, dateKey, nowMs) {
  const openToday = pendingRequests(requests, nowMs)
    .filter((request) => request.dateKey === dateKey).length;
  return openToday < MAX_OPEN_REQUESTS_PER_DAY;
}
