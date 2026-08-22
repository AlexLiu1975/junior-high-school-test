import { PERIODIC_TABLE_QUIZ } from "../../../functions/shared/quizzes/03-periodic-table/periodicTableDefinition.js";
import { createPeriodicAttempt } from "./periodicTableDomain.js";

const MAX_ERROR_COUNT = 100_000;
const MAX_ELAPSED_MS = 604_800_999;
const elementIds = PERIODIC_TABLE_QUIZ.elements.map(({ id }) => id);
const elementIdSet = new Set(elementIds);
const expectedTargets = new Map(
  PERIODIC_TABLE_QUIZ.elements.map(({ id, targetId }) => [id, targetId]),
);
const SCORE_RESULT_FIELDS = ["score", "correctCount", "wrongCount", "wrongIds"];

function invalidAttempt() {
  throw new Error("invalid-periodic-attempt");
}

function isPlainObject(value) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function isBoundedInteger(value, max) {
  return Number.isInteger(value) && value >= 0 && value <= max;
}

function hasExactKeys(value, expected) {
  return isPlainObject(value)
    && Object.keys(value).length === expected.length
    && Object.keys(value).every((key) => expected.includes(key));
}

function snapshotElapsed(state, nowMs) {
  if (state.timerState !== "running") return state.elapsedMs;
  if (!Number.isFinite(nowMs) || !Number.isFinite(state.segmentStartedAtMs)) invalidAttempt();
  return Math.min(MAX_ELAPSED_MS, state.elapsedMs + Math.max(0, nowMs - state.segmentStartedAtMs));
}

function canonicalAttempt(saved, { restore = false } = {}) {
  if (!isPlainObject(saved)
    || typeof saved.attemptId !== "string"
    || saved.attemptId.length === 0
    || !Array.isArray(saved.poolOrder)
    || !isPlainObject(saved.placements)
    || !isBoundedInteger(saved.errorCount, MAX_ERROR_COUNT)
    || !isBoundedInteger(saved.elapsedMs, MAX_ELAPSED_MS)
    || !["running", "paused"].includes(saved.timerState)) invalidAttempt();

  const poolOrder = [...saved.poolOrder];
  const placementEntries = Object.entries(saved.placements);
  if (poolOrder.length !== elementIds.length
    || new Set(poolOrder).size !== elementIds.length
    || poolOrder.some((id) => !elementIdSet.has(id))
    || new Set(placementEntries.map(([id]) => id)).size !== placementEntries.length
    || placementEntries.some(([id, targetId]) => (
      !elementIdSet.has(id) || expectedTargets.get(id) !== targetId
    ))) {
    invalidAttempt();
  }

  const timerState = restore ? "paused" : saved.timerState;
  const segmentStartedAtMs = timerState === "running" ? saved.segmentStartedAtMs : null;
  if (timerState === "running" && !Number.isFinite(segmentStartedAtMs)) invalidAttempt();

  return {
    attemptId: saved.attemptId,
    poolOrder,
    placements: Object.fromEntries(placementEntries),
    errorCount: saved.errorCount,
    elapsedMs: saved.elapsedMs,
    timerState,
    segmentStartedAtMs,
    lastAttempt: saved.lastAttempt ?? null,
  };
}

function restoreWireAttempt(saved) {
  const expectedKeys = [
    "attemptId", "poolOrder", "placedElementIds", "errorCount",
    "accumulatedSeconds", "timerState",
  ];
  if (!hasExactKeys(saved, expectedKeys)
    || !Array.isArray(saved.poolOrder)
    || !Array.isArray(saved.placedElementIds)
    || new Set(saved.placedElementIds).size !== saved.placedElementIds.length
    || saved.placedElementIds.some((id) => !elementIdSet.has(id))
    || !isBoundedInteger(saved.accumulatedSeconds, 604_800)) invalidAttempt();

  return canonicalAttempt({
    attemptId: saved.attemptId,
    poolOrder: saved.poolOrder,
    placements: Object.fromEntries(
      saved.placedElementIds.map((id) => [id, expectedTargets.get(id)]),
    ),
    errorCount: saved.errorCount,
    elapsedMs: saved.accumulatedSeconds * 1000,
    timerState: saved.timerState,
    segmentStartedAtMs: null,
  }, { restore: true });
}

function storedAttempt(state, nowMs) {
  const attempt = canonicalAttempt(state);
  return {
    attemptId: attempt.attemptId,
    poolOrder: attempt.poolOrder,
    placedElementIds: Object.keys(attempt.placements),
    errorCount: attempt.errorCount,
    accumulatedSeconds: Math.floor(snapshotElapsed(attempt, nowMs) / 1000),
    timerState: "paused",
  };
}

export const periodicTableAdapter = Object.freeze({
  createAttempt({
    attemptId = crypto.randomUUID(),
    random = Math.random,
    nowMs = Date.now(),
  } = {}) {
    if (typeof attemptId !== "string" || attemptId.length === 0) invalidAttempt();
    const attempt = createPeriodicAttempt(PERIODIC_TABLE_QUIZ.elements, random, nowMs);
    return canonicalAttempt({
      attemptId,
      poolOrder: attempt.pool.map(({ id }) => id),
      placements: attempt.placements,
      errorCount: attempt.errorCount,
      elapsedMs: attempt.elapsedMs,
      timerState: attempt.timerState,
      segmentStartedAtMs: attempt.segmentStartedAtMs,
      lastAttempt: attempt.lastAttempt,
    });
  },

  restoreAttempt(saved) {
    return restoreWireAttempt(saved);
  },

  serializeProgress(state, nowMs = Date.now()) {
    return { activeAttempt: storedAttempt(state, nowMs), reviewProgress: {} };
  },

  buildSubmission(state, nowMs = Date.now()) {
    const attempt = canonicalAttempt(state);
    if (Object.keys(attempt.placements).length !== elementIds.length) {
      throw new Error("incomplete-periodic-attempt");
    }
    return {
      attemptId: attempt.attemptId,
      placements: attempt.placements,
      errorCount: attempt.errorCount,
      durationSeconds: Math.floor(snapshotElapsed(attempt, nowMs) / 1000),
    };
  },

  renderResult(result) {
    if (!isPlainObject(result)
      || SCORE_RESULT_FIELDS.some((key) => Object.hasOwn(result, key))
      || result.resultType !== "placement"
      || result.completedCount !== elementIds.length
      || result.totalItems !== elementIds.length
      || !isBoundedInteger(result.errorCount, MAX_ERROR_COUNT)
      || !isBoundedInteger(result.durationSeconds, 604_800)
      || result.completed !== true) {
      throw new Error("invalid-periodic-result");
    }
    return {
      completedCount: result.completedCount,
      totalItems: result.totalItems,
      errorCount: result.errorCount,
      durationSeconds: result.durationSeconds,
      completed: true,
    };
  },

  restoreConfirmedSubmission({ currentAttempt, submission, result }) {
    if (submission?.attemptId !== currentAttempt?.attemptId) invalidAttempt();
    return {
      attempt: canonicalAttempt({
        ...currentAttempt,
        placements: submission.placements,
        errorCount: submission.errorCount,
        elapsedMs: submission.durationSeconds * 1000,
        timerState: "paused",
        segmentStartedAtMs: null,
      }, { restore: true }),
      result: periodicTableAdapter.renderResult(result),
    };
  },
});
