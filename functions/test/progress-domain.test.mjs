import assert from "node:assert/strict";
import test from "node:test";
import { normalizeProgressPayload } from "../progressDomain.js";
import { requireStudentIdentity } from "../studentIdentity.js";

const QUIZ_DEFINITION = {
  questions: [
    { id: "q1", options: [{ id: "q1-o1" }, { id: "q1-o2" }] },
    { id: "q2", options: [{ id: "q2-o1" }, { id: "q2-o2" }] },
  ],
};

const VALID_PROGRESS = {
  activeAttempt: {
    attemptId: "attempt-1",
    questionOrder: ["q2", "q1"],
    optionOrder: {
      q1: ["q1-o2", "q1-o1"],
      q2: ["q2-o1", "q2-o2"],
    },
    answers: { q1: "q1-o2" },
    currentQuestionIndex: 1,
  },
  reviewProgress: {
    q1: {
      errorCount: 1,
      stage: 0,
      lastResult: "wrong",
      lastAttempt: "2026/08/02",
      nextReview: "2026/08/03",
    },
  },
};

function createStudentDb(entryData) {
  const requested = [];
  return {
    requested,
    db: {
      collection(collectionName) {
        assert.equal(collectionName, "studentEntries");
        return {
          doc(studentCode) {
            requested.push(studentCode);
            return {
              collection(nameCollection) {
                assert.equal(nameCollection, "names");
                return {
                  doc(studentName) {
                    requested.push(studentName);
                    return {
                      async get() {
                        return { exists: true, data: () => entryData };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
    },
  };
}

test("normalizes only valid, whitelisted progress fields", () => {
  assert.deepEqual(normalizeProgressPayload(VALID_PROGRESS, QUIZ_DEFINITION), VALID_PROGRESS);
  assert.throws(
    () => normalizeProgressPayload({ ...VALID_PROGRESS, studentId: "student-2" }, QUIZ_DEFINITION),
    /invalid-progress-payload/,
  );
  assert.throws(
    () => normalizeProgressPayload({
      ...VALID_PROGRESS,
      activeAttempt: { ...VALID_PROGRESS.activeAttempt, answers: { q3: "q3-o1" } },
    }, QUIZ_DEFINITION),
    /invalid-progress-payload/,
  );
});

test("rejects malformed nested progress payload fields", () => {
  const malformedPayloads = [
    {
      ...VALID_PROGRESS,
      activeAttempt: {
        ...VALID_PROGRESS.activeAttempt,
        answers: { q1: "q1-o3" },
      },
    },
    {
      ...VALID_PROGRESS,
      activeAttempt: { ...VALID_PROGRESS.activeAttempt, unexpected: true },
    },
    {
      ...VALID_PROGRESS,
      activeAttempt: {
        attemptId: VALID_PROGRESS.activeAttempt.attemptId,
        questionOrder: VALID_PROGRESS.activeAttempt.questionOrder,
        optionOrder: VALID_PROGRESS.activeAttempt.optionOrder,
        answers: VALID_PROGRESS.activeAttempt.answers,
      },
    },
    {
      ...VALID_PROGRESS,
      activeAttempt: {
        ...VALID_PROGRESS.activeAttempt,
        optionOrder: {
          ...VALID_PROGRESS.activeAttempt.optionOrder,
          q1: ["q1-o1"],
        },
      },
    },
    {
      ...VALID_PROGRESS,
      reviewProgress: {
        q1: { ...VALID_PROGRESS.reviewProgress.q1, unexpected: true },
      },
    },
  ];

  for (const payload of malformedPayloads) {
    assert.throws(
      () => normalizeProgressPayload(payload, QUIZ_DEFINITION),
      /invalid-progress-payload/,
    );
  }
});

test("accepts only bounded ASCII attempt IDs", () => {
  for (const attemptId of ["run/1", "run 1", "run\u0001", "測驗-1", "a".repeat(81)]) {
    assert.throws(
      () => normalizeProgressPayload({
        ...VALID_PROGRESS,
        activeAttempt: { ...VALID_PROGRESS.activeAttempt, attemptId },
      }, QUIZ_DEFINITION),
      /invalid-progress-payload/,
    );
  }
});

test("requires real canonical review dates", () => {
  for (const reviewProgress of [
    { q1: { ...VALID_PROGRESS.reviewProgress.q1, lastAttempt: "2026/02/30" } },
    { q1: { ...VALID_PROGRESS.reviewProgress.q1, nextReview: "2026/2/03" } },
    { q1: { ...VALID_PROGRESS.reviewProgress.q1, nextReview: "2026/04/31" } },
  ]) {
    assert.throws(
      () => normalizeProgressPayload({ ...VALID_PROGRESS, reviewProgress }, QUIZ_DEFINITION),
      /invalid-progress-payload/,
    );
  }
});

test("resolves a trimmed active student entry without trusting a caller student ID", async () => {
  const { db, requested } = createStudentDb({ active: true, studentId: "student-1" });

  assert.deepEqual(
    await requireStudentIdentity(db, {
      studentCode: " 20260802-001 ",
      studentName: " 王小明 ",
      studentId: "student-2",
    }),
    { studentId: "student-1", studentCode: "20260802-001", studentName: "王小明" },
  );
  assert.deepEqual(requested, ["20260802-001", "王小明"]);
  await assert.rejects(
    requireStudentIdentity(db, { studentCode: "20260802-001", studentName: "王/小明" }),
    /invalid-student-identity/,
  );
});

test("rejects an inactive student entry", async () => {
  const { db } = createStudentDb({ active: false, studentId: "student-1" });
  await assert.rejects(
    requireStudentIdentity(db, { studentCode: "20260802-001", studentName: "王小明" }),
    /student-inactive/,
  );
});
