import assert from "node:assert/strict";
import test from "node:test";
import { PERIODIC_TABLE_QUIZ } from "../functions/shared/periodicTableDefinition.js";
import { normalizeQuizProgress } from "../functions/progressDomain.js";
import { periodicTableAdapter } from "../src/periodicTableAdapter.js";

const IDS = PERIODIC_TABLE_QUIZ.elements.map(({ id }) => id);

const SAVED_PERIODIC_ATTEMPT = {
  attemptId: "periodic-attempt-1",
  poolOrder: IDS,
  placedElementIds: [IDS[0], IDS[1]],
  errorCount: 3,
  accumulatedSeconds: 12,
  timerState: "running",
};

test("periodic adapter exposes the five shared shell methods", () => {
  assert.deepEqual(
    ["createAttempt", "restoreAttempt", "serializeProgress", "buildSubmission", "renderResult"]
      .map((name) => typeof periodicTableAdapter[name]),
    ["function", "function", "function", "function", "function"],
  );
});

test("periodic restore keeps pool order, placed IDs, errors, and paused elapsed time", () => {
  const restored = periodicTableAdapter.restoreAttempt(SAVED_PERIODIC_ATTEMPT, 500_000);
  assert.deepEqual(restored.poolOrder, SAVED_PERIODIC_ATTEMPT.poolOrder);
  assert.deepEqual(restored.placements, {
    [IDS[0]]: PERIODIC_TABLE_QUIZ.elements[0].targetId,
    [IDS[1]]: PERIODIC_TABLE_QUIZ.elements[1].targetId,
  });
  assert.equal(restored.errorCount, SAVED_PERIODIC_ATTEMPT.errorCount);
  assert.equal(restored.elapsedMs, 12_000);
  assert.equal(restored.timerState, "paused");
  assert.equal(restored.segmentStartedAtMs, null);
});

test("serialization snapshots a running segment without counting later offline time", () => {
  const attempt = periodicTableAdapter.createAttempt({
    attemptId: "periodic-attempt-2",
    random: () => 0,
    nowMs: 1_000,
  });
  const stored = periodicTableAdapter.serializeProgress(attempt, 4_500);
  const restored = periodicTableAdapter.restoreAttempt(stored.activeAttempt, 90_000);

  assert.deepEqual(Object.keys(stored.activeAttempt).sort(), [
    "accumulatedSeconds", "attemptId", "errorCount", "placedElementIds", "poolOrder", "timerState",
  ]);
  assert.equal(stored.activeAttempt.accumulatedSeconds, 3);
  assert.deepEqual(stored.activeAttempt.placedElementIds, []);
  assert.equal(stored.activeAttempt.timerState, "paused");
  assert.equal(restored.elapsedMs, 3_000);
  assert.equal(restored.timerState, "paused");
});

test("adapter progress round-trips through the real backend normalizer", () => {
  const created = periodicTableAdapter.createAttempt({
    attemptId: "periodic-wire-round-trip",
    random: () => 0,
    nowMs: 10_000,
  });
  const [placedId] = created.poolOrder;
  const uiAttempt = {
    ...created,
    placements: { [placedId]: PERIODIC_TABLE_QUIZ.elements.find(({ id }) => id === placedId).targetId },
    errorCount: 5,
  };
  const wire = periodicTableAdapter.serializeProgress(uiAttempt, 12_750);
  const normalized = normalizeQuizProgress(PERIODIC_TABLE_QUIZ, wire);
  const restored = periodicTableAdapter.restoreAttempt(normalized.activeAttempt);

  assert.deepEqual(restored.poolOrder, uiAttempt.poolOrder);
  assert.deepEqual(restored.placements, uiAttempt.placements);
  assert.equal(restored.errorCount, 5);
  assert.equal(restored.elapsedMs, 2_000);
  assert.equal(restored.timerState, "paused");
});

test("only a complete board can build a placement submission", () => {
  const incomplete = periodicTableAdapter.restoreAttempt(SAVED_PERIODIC_ATTEMPT);
  assert.throws(() => periodicTableAdapter.buildSubmission(incomplete, 15_000), /incomplete-periodic-attempt/);

  const placements = Object.fromEntries(
    PERIODIC_TABLE_QUIZ.elements.map(({ id, targetId }) => [id, targetId]),
  );
  const complete = {
    ...incomplete,
    poolOrder: IDS,
    placements,
    errorCount: 7,
    elapsedMs: 7_999,
    timerState: "paused",
  };
  assert.deepEqual(periodicTableAdapter.buildSubmission(complete, 99_000), {
    attemptId: "periodic-attempt-1",
    placements,
    errorCount: 7,
    durationSeconds: 7,
  });
});

test("server-confirmed placement result has no percentage score", () => {
  const result = periodicTableAdapter.renderResult({
    attemptId: "periodic-attempt-1",
    quizId: "periodic-table",
    studentName: "測試學生",
    resultType: "placement",
    completedCount: 118,
    totalItems: 118,
    errorCount: 8,
    durationSeconds: 321,
    completed: true,
  });
  assert.deepEqual(result, {
    completedCount: 118,
    totalItems: 118,
    errorCount: 8,
    durationSeconds: 321,
    completed: true,
  });
  assert.equal(Object.hasOwn(result, "score"), false);
});

test("malformed progress and forged results are rejected", () => {
  assert.throws(
    () => periodicTableAdapter.restoreAttempt({ ...SAVED_PERIODIC_ATTEMPT, poolOrder: [IDS[0]] }),
    /invalid-periodic-attempt/,
  );
  assert.throws(
    () => periodicTableAdapter.renderResult({
      resultType: "placement", completedCount: 118, totalItems: 118,
      errorCount: 0, durationSeconds: 1, completed: true, score: 100,
    }),
    /invalid-periodic-result/,
  );
  const placements = Object.fromEntries(
    PERIODIC_TABLE_QUIZ.elements.map(({ id, targetId }) => [id, targetId]),
  );
  delete placements[IDS[0]];
  placements["forged-element"] = undefined;
  assert.throws(() => periodicTableAdapter.buildSubmission({
    attemptId: "forged-ui-state",
    poolOrder: IDS,
    placements,
    errorCount: 0,
    elapsedMs: 0,
    timerState: "paused",
    segmentStartedAtMs: null,
  }), /invalid-periodic-attempt/);
});
