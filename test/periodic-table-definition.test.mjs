import assert from "node:assert/strict";
import test from "node:test";
import { PERIODIC_TABLE_QUIZ } from "../functions/shared/periodicTableDefinition.js";
import { validatePeriodicSubmission } from "../functions/shared/periodicTableSubmission.js";
import {
  createPeriodicAttempt,
  pauseTimer,
  placeElement,
  resumeTimer,
} from "../src/periodicTableDomain.js";

const alwaysZero = () => 0;

test("the periodic definition contains every atomic number exactly once", () => {
  assert.equal(PERIODIC_TABLE_QUIZ.elements.length, 118);
  assert.deepEqual(
    PERIODIC_TABLE_QUIZ.elements.map((element) => element.atomicNumber).sort((a, b) => a - b),
    Array.from({ length: 118 }, (_, index) => index + 1),
  );
  assert.equal(new Set(PERIODIC_TABLE_QUIZ.elements.map((element) => element.symbol)).size, 118);
  assert.equal(new Set(PERIODIC_TABLE_QUIZ.elements.map((element) => element.targetId)).size, 118);
});

test("the extracted definition preserves source names, categories, and display positions", () => {
  const byAtomicNumber = Object.fromEntries(
    PERIODIC_TABLE_QUIZ.elements.map((element) => [element.atomicNumber, element]),
  );

  assert.deepEqual(byAtomicNumber[1], {
    id: "element-001", atomicNumber: 1, symbol: "H", chineseName: "氫", englishName: "Hydrogen",
    category: "nonmetal", categoryClass: "c-nonmetal", row: "main", period: 1, column: 1,
    targetId: "main-r1-c1",
  });
  assert.deepEqual(byAtomicNumber[57], {
    id: "element-057", atomicNumber: 57, symbol: "La", chineseName: "鑭", englishName: "Lanthanum",
    category: "lanthanide", categoryClass: "c-lan", row: "lanthanide", period: 6, column: 1,
    targetId: "lanthanide-c1",
  });
  assert.deepEqual(byAtomicNumber[89], {
    id: "element-089", atomicNumber: 89, symbol: "Ac", chineseName: "錒", englishName: "Actinium",
    category: "actinide", categoryClass: "c-act", row: "actinide", period: 7, column: 1,
    targetId: "actinide-c1",
  });
  assert.deepEqual(byAtomicNumber[118], {
    id: "element-118", atomicNumber: 118, symbol: "Og", chineseName: "鿫", englishName: "Oganesson",
    category: "noble-gas", categoryClass: "c-noble", row: "main", period: 7, column: 18,
    targetId: "main-r7-c18",
  });
});

test("only a complete correct board creates a placement result", () => {
  const placements = Object.fromEntries(
    PERIODIC_TABLE_QUIZ.elements.map((element) => [element.id, element.targetId]),
  );

  assert.deepEqual(
    validatePeriodicSubmission({ placements, errorCount: 9, durationSeconds: 755 }),
    {
      resultType: "placement", completedCount: 118, totalItems: 118, errorCount: 9,
      durationSeconds: 755, completed: true,
    },
  );
  assert.throws(
    () => validatePeriodicSubmission({ placements: {}, errorCount: 0, durationSeconds: 1 }),
    /invalid-submission/,
  );
});

test("submission validation rejects extra, duplicated, wrong, and out-of-range fields", () => {
  const placements = Object.fromEntries(
    PERIODIC_TABLE_QUIZ.elements.map((element) => [element.id, element.targetId]),
  );
  const first = PERIODIC_TABLE_QUIZ.elements[0];
  const second = PERIODIC_TABLE_QUIZ.elements[1];

  for (const input of [
    { placements: { ...placements, extra: "main-r1-c1" }, errorCount: 0, durationSeconds: 1 },
    { placements: { ...placements, [first.id]: second.targetId }, errorCount: 0, durationSeconds: 1 },
    { placements: { ...placements, [second.id]: first.targetId }, errorCount: 0, durationSeconds: 1 },
    { placements, errorCount: -1, durationSeconds: 1 },
    { placements, errorCount: 100001, durationSeconds: 1 },
    { placements, errorCount: 0, durationSeconds: 604801 },
    { placements, errorCount: 0, durationSeconds: -1 },
    { placements, errorCount: 1.5, durationSeconds: 1 },
    { placements, errorCount: 0, durationSeconds: 1, score: 100 },
  ]) {
    assert.throws(() => validatePeriodicSubmission(input), /invalid-submission/);
  }
});

test("a new periodic attempt shuffles a copy with Fisher-Yates and resets progress", () => {
  const elements = PERIODIC_TABLE_QUIZ.elements.slice(0, 3);
  const sourceSnapshot = structuredClone(elements);
  const started = createPeriodicAttempt(elements, alwaysZero, 1000);
  const placed = placeElement(started, elements[0].id, elements[0].targetId);
  const fresh = createPeriodicAttempt(elements, alwaysZero, 9000);

  assert.deepEqual(started.pool.map((element) => element.id), [elements[1].id, elements[2].id, elements[0].id]);
  assert.deepEqual(elements, sourceSnapshot);
  assert.deepEqual(fresh.placements, {});
  assert.equal(fresh.errorCount, 0);
  assert.equal(fresh.elapsedMs, 0);
  assert.equal(fresh.timerState, "running");
  assert.equal(placed.pool.length, 2);
});

test("a correct placement removes one tile while wrong and duplicate attempts are bounded informational no-ops", () => {
  const elements = PERIODIC_TABLE_QUIZ.elements.slice(0, 2);
  const started = createPeriodicAttempt(elements, alwaysZero, 0);
  const wrong = placeElement(started, elements[0].id, elements[1].targetId);
  const placed = placeElement(wrong, elements[0].id, elements[0].targetId);
  const duplicate = placeElement(placed, elements[0].id, elements[0].targetId);
  const capped = placeElement({ ...started, errorCount: 100000 }, elements[0].id, elements[1].targetId);

  assert.equal(wrong.errorCount, 1);
  assert.equal(wrong.pool.length, 2);
  assert.deepEqual(wrong.lastAttempt, { elementId: elements[0].id, targetId: elements[1].targetId, correct: false });
  assert.equal(placed.errorCount, 1);
  assert.equal(placed.pool.length, 1);
  assert.deepEqual(placed.placements, { [elements[0].id]: elements[0].targetId });
  assert.equal(duplicate, placed);
  assert.equal(capped.errorCount, 100000);
});

test("pausing accumulates elapsed time and resuming excludes offline time", () => {
  const started = createPeriodicAttempt(PERIODIC_TABLE_QUIZ.elements.slice(0, 1), alwaysZero, 1000);
  const paused = pauseTimer(started, 2500);
  const resumed = resumeTimer(paused, 10000);
  const pausedAgain = pauseTimer(resumed, 12000);

  assert.deepEqual(
    { timerState: paused.timerState, elapsedMs: paused.elapsedMs, segmentStartedAtMs: paused.segmentStartedAtMs },
    { timerState: "paused", elapsedMs: 1500, segmentStartedAtMs: null },
  );
  assert.deepEqual(
    { timerState: resumed.timerState, elapsedMs: resumed.elapsedMs, segmentStartedAtMs: resumed.segmentStartedAtMs },
    { timerState: "running", elapsedMs: 1500, segmentStartedAtMs: 10000 },
  );
  assert.equal(pausedAgain.elapsedMs, 3500);
});
