import assert from "node:assert/strict";
import test from "node:test";
import { PERIODIC_TABLE_QUIZ } from "../functions/shared/periodicTableDefinition.js";
import { periodicTableAdapter } from "../src/periodicTableAdapter.js";

const IDS = PERIODIC_TABLE_QUIZ.elements.map(({ id }) => id);

const SAVED_PERIODIC_ATTEMPT = {
  attemptId: "periodic-attempt-1",
  poolOrder: IDS.slice(2),
  placements: {
    [IDS[0]]: PERIODIC_TABLE_QUIZ.elements[0].targetId,
    [IDS[1]]: PERIODIC_TABLE_QUIZ.elements[1].targetId,
  },
  errorCount: 3,
  elapsedMs: 12_345,
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
  assert.deepEqual(restored.placements, SAVED_PERIODIC_ATTEMPT.placements);
  assert.equal(restored.errorCount, SAVED_PERIODIC_ATTEMPT.errorCount);
  assert.equal(restored.elapsedMs, SAVED_PERIODIC_ATTEMPT.elapsedMs);
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

  assert.equal(stored.activeAttempt.elapsedMs, 3_500);
  assert.equal(stored.activeAttempt.timerState, "paused");
  assert.equal(restored.elapsedMs, 3_500);
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
    poolOrder: [],
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
});
