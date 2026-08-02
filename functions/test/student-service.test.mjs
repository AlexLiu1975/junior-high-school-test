import assert from "node:assert/strict";
import test from "node:test";
import {
  loadProgress,
  saveProgress,
  submitAttempt,
} from "../studentService.js";
import {
  QUIZ_DEFINITION,
  QUIZ_ID,
  QUIZ_VERSION,
} from "../shared/quizDefinition.js";

const functionsEntrypoint = await import("../index.js");

const NOW = new Date("2026-08-02T04:05:06.000Z");
const ANON_AUTH = {
  uid: "anonymous-uid",
  token: { firebase: { sign_in_provider: "anonymous" } },
};
const STUDENT = {
  studentId: "student-1",
  studentCode: "20260802-001",
  studentName: "王小明",
};
const OTHER_STUDENT = {
  studentId: "student-2",
  studentCode: "20260802-002",
  studentName: "李小華",
};

const QUESTION_ORDER = QUIZ_DEFINITION.questions.map(({ id }) => id);
const OPTION_ORDER = Object.fromEntries(
  QUIZ_DEFINITION.questions.map((question) => [
    question.id,
    question.options.map(({ id }) => id),
  ]),
);
const PERFECT_ANSWERS = Object.fromEntries(
  QUIZ_DEFINITION.questions.map((question) => [
    question.id,
    question.options.find(({ correct }) => correct).id,
  ]),
);
const REVIEW_PROGRESS = {
  q1: {
    errorCount: 0,
    stage: 1,
    lastResult: "correct",
    lastAttempt: "2026/08/02",
    nextReview: "2026/08/04",
  },
};

const ACTIVE_ATTEMPT = {
  attemptId: "attempt-progress-1",
  questionOrder: QUESTION_ORDER,
  optionOrder: OPTION_ORDER,
  answers: { q1: PERFECT_ANSWERS.q1 },
  currentQuestionIndex: 1,
};

const VALID_PROGRESS_INPUT = {
  studentCode: STUDENT.studentCode,
  studentName: STUDENT.studentName,
  quizId: QUIZ_ID,
  quizVersion: QUIZ_VERSION,
  activeAttempt: ACTIVE_ATTEMPT,
  reviewProgress: REVIEW_PROGRESS,
};

const PERFECT_INPUT = {
  studentCode: STUDENT.studentCode,
  studentName: STUDENT.studentName,
  attemptId: "attempt-submit-1",
  quizId: QUIZ_ID,
  quizVersion: QUIZ_VERSION,
  questionOrder: QUESTION_ORDER,
  optionOrder: OPTION_ORDER,
  answers: PERFECT_ANSWERS,
  reviewProgress: REVIEW_PROGRESS,
};

function studentKey({ studentCode, studentName }) {
  return `${studentCode}/${studentName}`;
}

function cloneMap(map) {
  return new Map([...map].map(([key, value]) => [key, structuredClone(value)]));
}

function createMemoryStudentRepository({
  approvedStudents = [STUDENT],
  inactiveStudents = [],
} = {}) {
  const students = new Map(
    approvedStudents.map((student) => [studentKey(student), { ...student, active: true }]),
  );
  for (const student of inactiveStudents) {
    students.set(studentKey(student), { ...student, active: false });
  }

  const repository = {
    students,
    progress: new Map(),
    attempts: new Map(),
    privateAttempts: new Map(),
    transactionRuns: 0,

    async resolveStudent(input, transaction) {
      const student = students.get(studentKey(input));
      if (!student) throw new Error("student-entry-not-found");
      if (student.active !== true) throw new Error("student-inactive");
      if (transaction) transaction.resolvedStudent = true;
      const { active: _active, ...identity } = student;
      return identity;
    },

    async getProgress(studentId, quizId, transaction) {
      return (transaction?.progress ?? repository.progress).get(`${studentId}/${quizId}`) ?? null;
    },

    async setProgress(studentId, quizId, value, transaction) {
      (transaction?.progress ?? repository.progress).set(
        `${studentId}/${quizId}`,
        structuredClone(value),
      );
    },

    async getAttempt(attemptId, transaction) {
      return (transaction?.attempts ?? repository.attempts).get(attemptId) ?? null;
    },

    async createAttempt(attemptId, value, transaction) {
      transaction.attempts.set(attemptId, structuredClone(value));
    },

    async createPrivateAttempt(attemptId, value, transaction) {
      transaction.privateAttempts.set(attemptId, structuredClone(value));
    },

    async runTransaction(callback) {
      repository.transactionRuns += 1;
      const transaction = {
        attempts: cloneMap(repository.attempts),
        privateAttempts: cloneMap(repository.privateAttempts),
        progress: cloneMap(repository.progress),
        resolvedStudent: false,
      };
      const result = await callback(transaction);
      assert.equal(transaction.resolvedStudent, true, "identity must resolve inside transaction");
      repository.attempts = transaction.attempts;
      repository.privateAttempts = transaction.privateAttempts;
      repository.progress = transaction.progress;
      return result;
    },
  };
  return repository;
}

test("anonymous authentication is required for every progress service", async () => {
  const calls = [
    () => loadProgress({
      repository: createMemoryStudentRepository(),
      auth: null,
      input: {
        studentCode: STUDENT.studentCode,
        studentName: STUDENT.studentName,
        quizId: QUIZ_ID,
        quizVersion: QUIZ_VERSION,
      },
    }),
    () => saveProgress({
      repository: createMemoryStudentRepository(),
      auth: {
        uid: "google-uid",
        token: { firebase: { sign_in_provider: "google.com" } },
      },
      input: VALID_PROGRESS_INPUT,
      now: NOW,
    }),
    () => submitAttempt({
      repository: createMemoryStudentRepository(),
      auth: {},
      input: PERFECT_INPUT,
      maskedIp: "203.0.113.xxx",
      now: NOW,
    }),
  ];

  for (const call of calls) await assert.rejects(call, /anonymous-auth-required/);
});

test("all student callable entrypoints reject unauthenticated requests", async () => {
  for (const name of ["loadStudentProgress", "saveStudentProgress", "submitQuizAttempt"]) {
    assert.equal(typeof functionsEntrypoint[name]?.run, "function");
    await assert.rejects(
      functionsEntrypoint[name].run({ auth: null, data: {}, rawRequest: {} }),
      (error) => error.code === "unauthenticated"
        && error.message === "anonymous-auth-required",
    );
  }
});

test("callable errors preserve stable client-actionable categories", () => {
  const cases = [
    ["student-entry-not-found", "permission-denied"],
    ["student-inactive", "failed-precondition"],
    ["invalid-progress-payload", "invalid-argument"],
    ["invalid-submission", "invalid-argument"],
    ["attempt-id-conflict", "already-exists"],
  ];

  for (const [message, code] of cases) {
    const converted = functionsEntrypoint.toCallableError(new Error(message));
    assert.equal(converted.code, code);
    assert.equal(converted.message, message);
  }
  const internal = functionsEntrypoint.toCallableError(new Error("database-secret-detail"));
  assert.equal(internal.code, "internal");
  assert.equal(internal.message, "internal-error");
});

test("callable IP handling masks only the server request IP or first forwarded value", () => {
  assert.equal(
    functionsEntrypoint.maskCallableIp({
      rawRequest: {
        ip: "203.0.113.42",
        headers: { "x-forwarded-for": "198.51.100.8, 192.0.2.1" },
      },
    }),
    "203.0.113.xxx",
  );
  assert.equal(
    functionsEntrypoint.maskCallableIp({
      rawRequest: { headers: { "x-forwarded-for": "198.51.100.8, 192.0.2.1" } },
    }),
    "198.51.100.xxx",
  );
});

test("loading progress resolves approved identity and never trusts caller studentId", async () => {
  const repository = createMemoryStudentRepository();
  repository.progress.set(`${STUDENT.studentId}/${QUIZ_ID}`, {
    studentId: STUDENT.studentId,
    quizId: QUIZ_ID,
    activeAttempt: ACTIVE_ATTEMPT,
    reviewProgress: REVIEW_PROGRESS,
    updatedAt: NOW,
    updatedByUid: ANON_AUTH.uid,
  });

  const loaded = await loadProgress({
    repository,
    auth: ANON_AUTH,
    input: {
      studentCode: STUDENT.studentCode,
      studentName: STUDENT.studentName,
      studentId: OTHER_STUDENT.studentId,
      quizId: QUIZ_ID,
      quizVersion: QUIZ_VERSION,
    },
  });

  assert.equal(loaded.studentId, STUDENT.studentId);
  assert.deepEqual(loaded.activeAttempt, ACTIVE_ATTEMPT);
});

test("missing and inactive student credentials are rejected", async () => {
  const repository = createMemoryStudentRepository({ inactiveStudents: [OTHER_STUDENT] });
  const base = {
    repository,
    auth: ANON_AUTH,
    input: {
      studentCode: "20260802-999",
      studentName: "不存在",
      quizId: QUIZ_ID,
      quizVersion: QUIZ_VERSION,
    },
  };

  await assert.rejects(loadProgress(base), /student-entry-not-found/);
  await assert.rejects(
    saveProgress({
      ...base,
      input: { ...VALID_PROGRESS_INPUT, ...OTHER_STUDENT },
      now: NOW,
    }),
    /student-inactive/,
  );
});

test("saving one student never writes another student path", async () => {
  const repository = createMemoryStudentRepository();
  const saved = await saveProgress({
    repository,
    auth: ANON_AUTH,
    input: { ...VALID_PROGRESS_INPUT, studentId: OTHER_STUDENT.studentId },
    now: NOW,
  });

  assert.deepEqual([...repository.progress.keys()], [`${STUDENT.studentId}/${QUIZ_ID}`]);
  assert.equal(saved.studentId, STUDENT.studentId);
  assert.equal(saved.updatedByUid, ANON_AUTH.uid);
});

test("invalid progress and unknown quiz payloads are rejected before writes", async () => {
  const repository = createMemoryStudentRepository();

  await assert.rejects(
    saveProgress({
      repository,
      auth: ANON_AUTH,
      input: {
        ...VALID_PROGRESS_INPUT,
        activeAttempt: { ...ACTIVE_ATTEMPT, answers: { q1: "not-an-option" } },
      },
      now: NOW,
    }),
    /invalid-progress-payload/,
  );
  await assert.rejects(
    loadProgress({
      repository,
      auth: ANON_AUTH,
      input: {
        studentCode: STUDENT.studentCode,
        studentName: STUDENT.studentName,
        quizId: "unknown-quiz",
        quizVersion: QUIZ_VERSION,
      },
    }),
    /invalid-quiz/,
  );
  assert.equal(repository.progress.size, 0);
});

test("the same attemptId is committed once and returns the stored result on retry", async () => {
  const repository = createMemoryStudentRepository();
  const first = await submitAttempt({
    repository,
    auth: ANON_AUTH,
    input: PERFECT_INPUT,
    maskedIp: "203.0.113.xxx",
    now: NOW,
  });
  const second = await submitAttempt({
    repository,
    auth: ANON_AUTH,
    input: {
      ...PERFECT_INPUT,
      quizVersion: 999,
      questionOrder: [],
      optionOrder: {},
      answers: {},
      reviewProgress: { notAQuestion: {} },
    },
    maskedIp: "198.51.100.xxx",
    now: new Date("2026-08-02T05:05:06.000Z"),
  });

  assert.equal(first.attemptId, PERFECT_INPUT.attemptId);
  assert.deepEqual(second, first);
  assert.equal(repository.attempts.size, 1);
  assert.equal(repository.privateAttempts.size, 1);
  assert.equal(repository.privateAttempts.get(PERFECT_INPUT.attemptId).maskedIp, "203.0.113.xxx");
  assert.equal(repository.transactionRuns, 2);
});

test("attempt completion recomputes score and atomically clears only active progress", async () => {
  const repository = createMemoryStudentRepository();
  repository.progress.set(`${STUDENT.studentId}/${QUIZ_ID}`, {
    studentId: STUDENT.studentId,
    quizId: QUIZ_ID,
    activeAttempt: ACTIVE_ATTEMPT,
    reviewProgress: {
      q2: {
        errorCount: 2,
        stage: 0,
        lastResult: "wrong",
        lastAttempt: "2026/08/01",
        nextReview: "2026/08/02",
      },
    },
    updatedAt: new Date("2026-08-01T01:00:00.000Z"),
    updatedByUid: "earlier-anonymous-uid",
  });

  const result = await submitAttempt({
    repository,
    auth: ANON_AUTH,
    input: { ...PERFECT_INPUT, score: 0 },
    maskedIp: "203.0.113.xxx",
    now: NOW,
  });

  assert.equal(result.score, 100);
  assert.equal(result.correctCount, 20);
  assert.equal(result.wrongCount, 0);
  assert.equal(result.studentId, STUDENT.studentId);
  assert.equal(result.studentUid, ANON_AUTH.uid);
  assert.equal(result.submittedAt, NOW);
  assert.deepEqual(repository.privateAttempts.get(PERFECT_INPUT.attemptId), {
    maskedIp: "203.0.113.xxx",
    createdAt: NOW,
  });
  assert.deepEqual(repository.progress.get(`${STUDENT.studentId}/${QUIZ_ID}`), {
    studentId: STUDENT.studentId,
    quizId: QUIZ_ID,
    activeAttempt: null,
    reviewProgress: {
      q2: {
        errorCount: 2,
        stage: 0,
        lastResult: "wrong",
        lastAttempt: "2026/08/01",
        nextReview: "2026/08/02",
      },
      ...REVIEW_PROGRESS,
    },
    updatedAt: NOW,
    updatedByUid: ANON_AUTH.uid,
  });
});

test("a delayed save cannot restore an attempt that has already completed", async () => {
  const repository = createMemoryStudentRepository();
  await submitAttempt({
    repository,
    auth: ANON_AUTH,
    input: PERFECT_INPUT,
    maskedIp: "203.0.113.xxx",
    now: NOW,
  });
  const completedProgress = structuredClone(
    repository.progress.get(`${STUDENT.studentId}/${QUIZ_ID}`),
  );

  const saved = await saveProgress({
    repository,
    auth: ANON_AUTH,
    input: {
      ...VALID_PROGRESS_INPUT,
      activeAttempt: {
        ...ACTIVE_ATTEMPT,
        attemptId: PERFECT_INPUT.attemptId,
      },
      reviewProgress: {},
    },
    now: new Date("2026-08-02T06:05:06.000Z"),
  });

  assert.deepEqual(saved, completedProgress);
  assert.deepEqual(
    repository.progress.get(`${STUDENT.studentId}/${QUIZ_ID}`),
    completedProgress,
  );
  assert.equal(saved.activeAttempt, null);
  assert.deepEqual(saved.reviewProgress, REVIEW_PROGRESS);
});

test("invalid submissions roll back and mismatched attempt reuse conflicts", async () => {
  const repository = createMemoryStudentRepository({ approvedStudents: [STUDENT, OTHER_STUDENT] });
  await assert.rejects(
    submitAttempt({
      repository,
      auth: ANON_AUTH,
      input: {
        ...PERFECT_INPUT,
        answers: { ...PERFECT_ANSWERS, q1: "not-an-option" },
      },
      maskedIp: "203.0.113.xxx",
      now: NOW,
    }),
    /invalid-submission/,
  );
  assert.equal(repository.attempts.size, 0);
  assert.equal(repository.privateAttempts.size, 0);
  assert.equal(repository.progress.size, 0);

  await submitAttempt({
    repository,
    auth: ANON_AUTH,
    input: PERFECT_INPUT,
    maskedIp: "203.0.113.xxx",
    now: NOW,
  });
  await assert.rejects(
    submitAttempt({
      repository,
      auth: ANON_AUTH,
      input: {
        ...PERFECT_INPUT,
        studentCode: OTHER_STUDENT.studentCode,
        studentName: OTHER_STUDENT.studentName,
      },
      maskedIp: "198.51.100.xxx",
      now: NOW,
    }),
    /attempt-id-conflict/,
  );
  assert.equal(repository.attempts.size, 1);
  assert.equal(repository.privateAttempts.size, 1);
});

test("the same student cannot reuse an attemptId for a different quiz", async () => {
  const repository = createMemoryStudentRepository();
  repository.attempts.set(PERFECT_INPUT.attemptId, {
    quizId: "different-quiz",
    studentId: STUDENT.studentId,
    score: 50,
  });

  await assert.rejects(
    submitAttempt({
      repository,
      auth: ANON_AUTH,
      input: PERFECT_INPUT,
      maskedIp: "203.0.113.xxx",
      now: NOW,
    }),
    /attempt-id-conflict/,
  );
  assert.equal(repository.privateAttempts.size, 0);
  assert.equal(repository.progress.size, 0);
});
