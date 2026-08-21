import assert from "node:assert/strict";
import test from "node:test";
import {
  gradeAnswers,
  loadProgress,
  saveProgress,
  submitAttempt,
} from "../studentService.js";
import {
  LEGACY_BIOLOGY_DEFINITIONS,
  QUIZ_DEFINITION,
  QUIZ_ID,
  QUIZ_VERSION,
} from "../shared/quizzes/01-biology/biologyDefinition.js";
import { ENGLISH_REVIEW_2 } from "../shared/quizzes/02-english/englishReview2Definition.js";
import { PERIODIC_TABLE_QUIZ } from "../shared/quizzes/03-periodic-table/periodicTableDefinition.js";

const functionsEntrypoint = await import("../index.js");

test("every exported callable exposes the nam5-aligned endpoint metadata and resource limits", () => {
  for (const name of [
    "loadStudentProgress",
    "saveStudentProgress",
    "submitQuizAttempt",
    "gradeQuizAnswers",
    "removeOrDeactivateStudent",
  ]) {
    const endpoint = functionsEntrypoint[name]?.__endpoint;
    assert.deepEqual(endpoint?.region, ["us-central1"], `${name} must target us-central1`);
    assert.equal(endpoint?.maxInstances, 3, `${name} must retain maxInstances`);
    assert.equal(endpoint?.timeoutSeconds, 30, `${name} must retain timeoutSeconds`);
    assert.equal(endpoint?.availableMemoryMb, 256, `${name} must retain memory`);
  }
});

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
  baseRevision: 0,
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

const PERIODIC_PLACEMENTS = Object.fromEntries(
  PERIODIC_TABLE_QUIZ.elements.map(({ id, targetId }) => [id, targetId]),
);
const VALID_PERIODIC_INPUT = {
  studentCode: STUDENT.studentCode,
  studentName: STUDENT.studentName,
  attemptId: "attempt-periodic-1",
  quizId: "periodic-table",
  quizVersion: PERIODIC_TABLE_QUIZ.version,
  placements: PERIODIC_PLACEMENTS,
  errorCount: 9,
  durationSeconds: 755,
};
const ENGLISH_QUESTION_ORDER = ENGLISH_REVIEW_2.questions.map(({ id }) => id);
const ENGLISH_OPTION_ORDER = Object.fromEntries(
  ENGLISH_REVIEW_2.questions.map((question) => [
    question.id,
    question.options.map(({ id }) => id),
  ]),
);

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

    async createAttemptRecords(attemptId, publicValue, privateValue, transaction) {
      transaction.attempts.set(attemptId, structuredClone(publicValue));
      transaction.privateAttempts.set(attemptId, structuredClone(privateValue));
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
  for (const name of ["loadStudentProgress", "saveStudentProgress", "submitQuizAttempt", "gradeQuizAnswers"]) {
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
    ["progress-conflict", "aborted"],
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
  assert.equal(loaded.revision, 0);
});

test("empty progress starts at revision zero", async () => {
  const loaded = await loadProgress({
    repository: createMemoryStudentRepository(),
    auth: ANON_AUTH,
    input: {
      studentCode: STUDENT.studentCode,
      studentName: STUDENT.studentName,
      quizId: QUIZ_ID,
      quizVersion: QUIZ_VERSION,
    },
  });

  assert.equal(loaded.revision, 0);
});

test("stale base revisions cannot overwrite newer cloud progress", async () => {
  const repository = createMemoryStudentRepository();
  const first = await saveProgress({
    repository,
    auth: ANON_AUTH,
    input: { ...VALID_PROGRESS_INPUT, baseRevision: 0 },
    now: NOW,
  });
  assert.equal(first.revision, 1);

  await assert.rejects(
    saveProgress({
      repository,
      auth: ANON_AUTH,
      input: {
        ...VALID_PROGRESS_INPUT,
        baseRevision: 0,
        activeAttempt: {
          ...ACTIVE_ATTEMPT,
          answers: { q2: PERFECT_ANSWERS.q2 },
        },
      },
      now: new Date("2026-08-02T05:05:06.000Z"),
    }),
    /progress-conflict/,
  );

  assert.equal(repository.progress.get(`${STUDENT.studentId}/${QUIZ_ID}`).revision, 1);
  assert.deepEqual(
    repository.progress.get(`${STUDENT.studentId}/${QUIZ_ID}`).activeAttempt.answers,
    ACTIVE_ATTEMPT.answers,
  );
});

test("submission clears active progress and increments its current revision", async () => {
  const repository = createMemoryStudentRepository();
  repository.progress.set(`${STUDENT.studentId}/${QUIZ_ID}`, {
    studentId: STUDENT.studentId,
    quizId: QUIZ_ID,
    quizVersion: QUIZ_VERSION,
    kind: "multiple-choice",
    revision: 7,
    activeAttempt: ACTIVE_ATTEMPT,
    reviewProgress: {},
    updatedAt: NOW,
    updatedByUid: ANON_AUTH.uid,
  });

  await submitAttempt({
    repository,
    auth: ANON_AUTH,
    input: PERFECT_INPUT,
    maskedIp: "203.0.113.xxx",
    now: new Date("2026-08-02T05:05:06.000Z"),
  });

  const progress = repository.progress.get(`${STUDENT.studentId}/${QUIZ_ID}`);
  assert.equal(progress.revision, 8);
  assert.equal(progress.activeAttempt, null);
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
  assert.equal(saved.quizVersion, QUIZ_VERSION);
  assert.equal(saved.kind, "multiple-choice");
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

test("progress services reject unknown and cross-kind top-level fields", async () => {
  for (const extraFields of [
    { placements: {} },
    { poolOrder: [] },
    { unexpected: true },
  ]) {
    const repository = createMemoryStudentRepository();
    await assert.rejects(
      saveProgress({
        repository,
        auth: ANON_AUTH,
        input: { ...VALID_PROGRESS_INPUT, ...extraFields },
        now: NOW,
      }),
      /invalid-progress-payload/,
    );
    assert.equal(repository.progress.size, 0);
  }
});

test("the same attemptId returns a fixed stored result before mutable body revalidation", async () => {
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
      questionOrder: [],
      optionOrder: {},
      answers: { unknown: "not-an-option" },
      reviewProgress: { notAQuestion: {} },
      unexpectedMutableField: { secret: true },
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

test("a retry must identify a registered quiz version before stored-attempt matching", async () => {
  const repository = createMemoryStudentRepository();
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
      input: { ...PERFECT_INPUT, quizVersion: 999 },
      maskedIp: "198.51.100.xxx",
      now: NOW,
    }),
    /invalid-quiz/,
  );
  assert.equal(repository.attempts.size, 1);
  assert.equal(repository.privateAttempts.size, 1);
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
    quizVersion: QUIZ_VERSION,
    kind: "multiple-choice",
    revision: 1,
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

test("Biology v2 returns every trusted explanation on direct submission and exact retry without persistence", async () => {
  const repository = createMemoryStudentRepository();
  const result = await submitAttempt({
    repository,
    auth: ANON_AUTH,
    input: PERFECT_INPUT,
    maskedIp: "203.0.113.xxx",
    now: NOW,
  });

  assert.equal(result.reviewAvailable, true);
  assert.equal(result.review.length, 20);
  assert.deepEqual(
    result.review.map(({ questionId }) => questionId),
    QUIZ_DEFINITION.questions.map(({ id }) => id),
  );
  for (const item of result.review) {
    assert.deepEqual(
      Object.keys(item).sort(),
      ["correctOptionId", "explanation", "questionId"],
    );
  }

  const persisted = repository.attempts.get(result.attemptId);
  for (const forbidden of [
    "review", "reviewAvailable", "answers", "explanation", "explanations",
  ]) {
    assert.equal(Object.hasOwn(persisted, forbidden), false);
  }
  const retry = await submitAttempt({
    repository,
    auth: ANON_AUTH,
    input: { ...PERFECT_INPUT, answers: { unknown: "not-an-option" } },
    maskedIp: "198.51.100.xxx",
    now: NOW,
  });
  assert.deepEqual(retry, result);
  assert.equal(repository.attempts.size, 1);
  assert.equal(repository.privateAttempts.size, 1);
});

test("Biology v1 stored retry exposes safe score only", async () => {
  const repository = createMemoryStudentRepository();
  const definition = LEGACY_BIOLOGY_DEFINITIONS[0];
  const attemptId = "attempt-biology-v1-retry";
  repository.attempts.set(attemptId, {
    quizId: definition.id,
    quizVersion: definition.version,
    quizKind: definition.kind,
    quizTitle: definition.title,
    subject: definition.subject,
    studentUid: ANON_AUTH.uid,
    studentId: STUDENT.studentId,
    studentCode: STUDENT.studentCode,
    studentName: STUDENT.studentName,
    submittedAt: NOW,
    resultType: "score",
    score: 95,
    correctCount: 19,
    wrongCount: 1,
    wrongIds: ["q14"],
  });

  const retry = await submitAttempt({
    repository,
    auth: ANON_AUTH,
    input: {
      ...PERFECT_INPUT,
      attemptId,
      quizVersion: definition.version,
      questionOrder: [],
      optionOrder: {},
      answers: { unknown: "not-an-option" },
    },
    maskedIp: "198.51.100.xxx",
    now: NOW,
  });

  assert.equal(retry.reviewAvailable, false);
  assert.equal(Object.hasOwn(retry, "review"), false);
  assert.deepEqual(retry.wrongIds, ["q14"]);
  assert.equal(repository.attempts.size, 1);
  assert.equal(repository.privateAttempts.size, 0);
});

test("registered English attempts use trusted catalog metadata and fixed score fields", async () => {
  const repository = createMemoryStudentRepository();
  const firstQuestion = ENGLISH_REVIEW_2.questions[0];
  const correctAnswer = firstQuestion.options.find(({ correct }) => correct).id;
  const input = {
    studentCode: STUDENT.studentCode,
    studentName: STUDENT.studentName,
    studentId: OTHER_STUDENT.studentId,
    attemptId: "attempt-english-1",
    quizId: ENGLISH_REVIEW_2.id,
    quizVersion: ENGLISH_REVIEW_2.version,
    title: "forged title",
    subject: "forged subject",
    kind: "placement",
    score: 100,
    questionOrder: ENGLISH_QUESTION_ORDER,
    optionOrder: ENGLISH_OPTION_ORDER,
    answers: { [firstQuestion.id]: correctAnswer },
    reviewProgress: {},
  };

  const result = await submitAttempt({
    repository,
    auth: ANON_AUTH,
    input,
    maskedIp: "203.0.113.xxx",
    now: NOW,
  });
  const expectedWrongIds = ENGLISH_REVIEW_2.questions.slice(1).map(({ id }) => id);
  const expectedReview = ENGLISH_REVIEW_2.questions.slice(1).map((question) => ({
    questionId: question.id,
    correctOptionId: question.options.find(({ correct }) => correct).id,
    explanation: question.explanation,
  }));

  assert.deepEqual(result, {
    attemptId: input.attemptId,
    quizId: "english-review-2",
    quizVersion: 1,
    quizKind: "multiple-choice",
    quizTitle: ENGLISH_REVIEW_2.title,
    subject: ENGLISH_REVIEW_2.subject,
    studentUid: ANON_AUTH.uid,
    studentId: STUDENT.studentId,
    studentCode: STUDENT.studentCode,
    studentName: STUDENT.studentName,
    submittedAt: NOW,
    resultType: "score",
    score: 2,
    correctCount: 1,
    wrongCount: 39,
    wrongIds: expectedWrongIds,
    review: expectedReview,
  });
  assert.deepEqual(repository.attempts.get(input.attemptId).wrongIds, expectedWrongIds);
  assert.equal(Object.hasOwn(repository.attempts.get(input.attemptId), "review"), false);
  assert.equal(Object.hasOwn(result, "answers"), false);
  assert.equal(Object.hasOwn(result, "correctOptionIds"), false);
  assert.equal(Object.hasOwn(result, "completedCount"), false);
  repository.attempts.set(input.attemptId, {
    ...repository.attempts.get(input.attemptId),
    answers: { e01: correctAnswer },
    correctOptionIds: [correctAnswer],
    extraSecret: "must-not-leak",
  });
  const retry = await submitAttempt({
    repository,
    auth: ANON_AUTH,
    input: { ...input, answers: { unknown: "not-an-option" } },
    maskedIp: "198.51.100.xxx",
    now: NOW,
  });
  assert.deepEqual(retry, result);
  assert.equal(Object.hasOwn(retry, "answers"), false);
  assert.equal(Object.hasOwn(retry, "correctOptionIds"), false);
  assert.deepEqual([...repository.privateAttempts.keys()], [input.attemptId]);
});

test("new English submissions reject caller-supplied wrongIds", async () => {
  const repository = createMemoryStudentRepository();
  const input = {
    studentCode: STUDENT.studentCode,
    studentName: STUDENT.studentName,
    attemptId: "attempt-english-caller-wrong-ids",
    quizId: ENGLISH_REVIEW_2.id,
    quizVersion: ENGLISH_REVIEW_2.version,
    questionOrder: ENGLISH_QUESTION_ORDER,
    optionOrder: ENGLISH_OPTION_ORDER,
    answers: {},
    reviewProgress: {},
    wrongIds: [],
  };

  await assert.rejects(
    submitAttempt({ repository, auth: ANON_AUTH, input, maskedIp: "203.0.113.xxx", now: NOW }),
    /invalid-submission/,
  );
  assert.equal(repository.attempts.size, 0);
});

test("callers cannot inject review data and placement results never expose review", async () => {
  const repository = createMemoryStudentRepository();
  await assert.rejects(
    submitAttempt({
      repository,
      auth: ANON_AUTH,
      input: { ...PERFECT_INPUT, review: [{ questionId: "q1", correctOptionId: "q1-o1" }] },
      maskedIp: "203.0.113.xxx",
      now: NOW,
    }),
    /invalid-submission/,
  );
  const placement = await submitAttempt({
    repository,
    auth: ANON_AUTH,
    input: VALID_PERIODIC_INPUT,
    maskedIp: "203.0.113.xxx",
    now: NOW,
  });
  assert.equal(Object.hasOwn(placement, "review"), false);
  assert.equal(Object.hasOwn(placement, "reviewAvailable"), false);
});

test("a stored score retry rejects wrong IDs outside the registered question set", async () => {
  const repository = createMemoryStudentRepository();
  const firstQuestion = ENGLISH_REVIEW_2.questions[0];
  const correctAnswer = firstQuestion.options.find(({ correct }) => correct).id;
  const input = {
    studentCode: STUDENT.studentCode,
    studentName: STUDENT.studentName,
    attemptId: "attempt-english-corrupt-wrong-ids",
    quizId: ENGLISH_REVIEW_2.id,
    quizVersion: ENGLISH_REVIEW_2.version,
    questionOrder: ENGLISH_QUESTION_ORDER,
    optionOrder: ENGLISH_OPTION_ORDER,
    answers: { [firstQuestion.id]: correctAnswer },
    reviewProgress: {},
  };
  await submitAttempt({ repository, auth: ANON_AUTH, input, maskedIp: "203.0.113.xxx", now: NOW });
  repository.attempts.get(input.attemptId).wrongIds[0] = "e99";

  await assert.rejects(
    submitAttempt({ repository, auth: ANON_AUTH, input, maskedIp: "203.0.113.xxx", now: NOW }),
    /attempt-id-conflict/,
  );
});

test("a stored score retry rejects present but malformed wrongIds", async () => {
  const firstQuestion = ENGLISH_REVIEW_2.questions[0];
  const correctAnswer = firstQuestion.options.find(({ correct }) => correct).id;
  const input = {
    studentCode: STUDENT.studentCode,
    studentName: STUDENT.studentName,
    attemptId: "attempt-english-malformed-wrong-ids",
    quizId: ENGLISH_REVIEW_2.id,
    quizVersion: ENGLISH_REVIEW_2.version,
    questionOrder: ENGLISH_QUESTION_ORDER,
    optionOrder: ENGLISH_OPTION_ORDER,
    answers: { [firstQuestion.id]: correctAnswer },
    reviewProgress: {},
  };

  for (const wrongIds of [undefined, ["e02", "e02"], ["e02", "e03"]]) {
    const repository = createMemoryStudentRepository();
    await submitAttempt({
      repository,
      auth: ANON_AUTH,
      input,
      maskedIp: "203.0.113.xxx",
      now: NOW,
    });
    repository.attempts.get(input.attemptId).wrongIds = wrongIds;

    await assert.rejects(
      submitAttempt({ repository, auth: ANON_AUTH, input, maskedIp: "203.0.113.xxx", now: NOW }),
      /attempt-id-conflict/,
    );
  }
});

test("a current-format English score saved before wrongIds returns a safe legacy projection", async () => {
  const repository = createMemoryStudentRepository();
  const input = {
    studentCode: STUDENT.studentCode,
    studentName: STUDENT.studentName,
    attemptId: "attempt-english-before-wrong-ids",
    quizId: ENGLISH_REVIEW_2.id,
    quizVersion: ENGLISH_REVIEW_2.version,
    questionOrder: ENGLISH_QUESTION_ORDER,
    optionOrder: ENGLISH_OPTION_ORDER,
    answers: {},
    reviewProgress: {},
  };
  repository.attempts.set(input.attemptId, {
    quizId: ENGLISH_REVIEW_2.id,
    quizVersion: ENGLISH_REVIEW_2.version,
    quizKind: "multiple-choice",
    quizTitle: ENGLISH_REVIEW_2.title,
    subject: ENGLISH_REVIEW_2.subject,
    studentUid: ANON_AUTH.uid,
    studentId: STUDENT.studentId,
    studentCode: STUDENT.studentCode,
    studentName: STUDENT.studentName,
    submittedAt: NOW,
    resultType: "score",
    score: 95,
    correctCount: 38,
    wrongCount: 2,
    answers: { e01: "must-not-leak" },
    extraSecret: "must-not-leak",
  });

  const retry = await submitAttempt({
    repository,
    auth: ANON_AUTH,
    input,
    maskedIp: "198.51.100.xxx",
    now: NOW,
  });

  assert.deepEqual(retry, {
    attemptId: input.attemptId,
    quizId: ENGLISH_REVIEW_2.id,
    quizVersion: ENGLISH_REVIEW_2.version,
    quizKind: "multiple-choice",
    quizTitle: ENGLISH_REVIEW_2.title,
    subject: ENGLISH_REVIEW_2.subject,
    studentUid: ANON_AUTH.uid,
    studentId: STUDENT.studentId,
    studentCode: STUDENT.studentCode,
    studentName: STUDENT.studentName,
    submittedAt: NOW,
    resultType: "score",
    score: 95,
    correctCount: 38,
    wrongCount: 2,
  });
});

test("placement attempts use a fixed placement result and never accept score fields", async () => {
  const repository = createMemoryStudentRepository();
  await assert.rejects(
    submitAttempt({
      repository,
      auth: ANON_AUTH,
      input: { ...VALID_PERIODIC_INPUT, score: 100 },
      maskedIp: "203.0.113.xxx",
      now: NOW,
    }),
    (error) => error?.message === "invalid-submission",
  );
  await assert.rejects(
    submitAttempt({
      repository,
      auth: ANON_AUTH,
      input: { ...VALID_PERIODIC_INPUT, wrongIds: ["h"] },
      maskedIp: "203.0.113.xxx",
      now: NOW,
    }),
    (error) => error?.message === "invalid-submission",
  );
  assert.equal(repository.attempts.size, 0);
  assert.equal(repository.privateAttempts.size, 0);

  const result = await submitAttempt({
    repository,
    auth: ANON_AUTH,
    input: VALID_PERIODIC_INPUT,
    maskedIp: "203.0.113.xxx",
    now: NOW,
  });
  assert.deepEqual(result, {
    attemptId: VALID_PERIODIC_INPUT.attemptId,
    quizId: "periodic-table",
    quizVersion: 1,
    quizKind: "placement",
    quizTitle: PERIODIC_TABLE_QUIZ.title,
    subject: PERIODIC_TABLE_QUIZ.subject,
    studentUid: ANON_AUTH.uid,
    studentId: STUDENT.studentId,
    studentCode: STUDENT.studentCode,
    studentName: STUDENT.studentName,
    submittedAt: NOW,
    resultType: "placement",
    completedCount: 118,
    totalItems: 118,
    errorCount: 9,
    durationSeconds: 755,
    completed: true,
  });
  assert.equal(Object.hasOwn(result, "score"), false);
  assert.deepEqual([...repository.attempts.keys()], [VALID_PERIODIC_INPUT.attemptId]);
  assert.deepEqual([...repository.privateAttempts.keys()], [VALID_PERIODIC_INPUT.attemptId]);
});

test("a matching stored placement attempt returns a fixed projection without extra fields", async () => {
  const repository = createMemoryStudentRepository();
  const stored = {
    quizId: VALID_PERIODIC_INPUT.quizId,
    quizVersion: VALID_PERIODIC_INPUT.quizVersion,
    quizKind: "placement",
    quizTitle: PERIODIC_TABLE_QUIZ.title,
    subject: PERIODIC_TABLE_QUIZ.subject,
    studentUid: ANON_AUTH.uid,
    studentId: STUDENT.studentId,
    studentCode: STUDENT.studentCode,
    studentName: STUDENT.studentName,
    submittedAt: NOW,
    resultType: "placement",
    completedCount: 118,
    totalItems: 118,
    errorCount: 9,
    durationSeconds: 755,
    completed: true,
    extraSecret: "must-not-leak",
  };
  repository.attempts.set(VALID_PERIODIC_INPUT.attemptId, stored);

  assert.deepEqual(await submitAttempt({
    repository,
    auth: ANON_AUTH,
    input: {
      ...VALID_PERIODIC_INPUT,
      placements: {},
      score: 100,
    },
    maskedIp: "198.51.100.xxx",
    now: NOW,
  }), {
    attemptId: VALID_PERIODIC_INPUT.attemptId,
    quizId: VALID_PERIODIC_INPUT.quizId,
    quizVersion: VALID_PERIODIC_INPUT.quizVersion,
    quizKind: "placement",
    quizTitle: PERIODIC_TABLE_QUIZ.title,
    subject: PERIODIC_TABLE_QUIZ.subject,
    studentUid: ANON_AUTH.uid,
    studentId: STUDENT.studentId,
    studentCode: STUDENT.studentCode,
    studentName: STUDENT.studentName,
    submittedAt: NOW,
    resultType: "placement",
    completedCount: 118,
    totalItems: 118,
    errorCount: 9,
    durationSeconds: 755,
    completed: true,
  });
  assert.equal(repository.privateAttempts.size, 0);
});

test("stored attempt version and kind mismatches conflict", async () => {
  for (const mismatchedIdentity of [
    { quizVersion: 2, quizKind: "placement" },
    { quizVersion: 1, quizKind: "multiple-choice" },
  ]) {
    const repository = createMemoryStudentRepository();
    repository.attempts.set(VALID_PERIODIC_INPUT.attemptId, {
      quizId: VALID_PERIODIC_INPUT.quizId,
      quizTitle: PERIODIC_TABLE_QUIZ.title,
      subject: PERIODIC_TABLE_QUIZ.subject,
      studentUid: ANON_AUTH.uid,
      studentId: STUDENT.studentId,
      studentCode: STUDENT.studentCode,
      studentName: STUDENT.studentName,
      submittedAt: NOW,
      resultType: "placement",
      completedCount: 118,
      totalItems: 118,
      errorCount: 9,
      durationSeconds: 755,
      completed: true,
      ...mismatchedIdentity,
    });

    await assert.rejects(
      submitAttempt({
        repository,
        auth: ANON_AUTH,
        input: VALID_PERIODIC_INPUT,
        maskedIp: "198.51.100.xxx",
        now: NOW,
      }),
      /attempt-id-conflict/,
    );
  }
});

test("corrupted stored result kinds conflict instead of leaking raw fields", async () => {
  const base = {
    quizId: VALID_PERIODIC_INPUT.quizId,
    quizVersion: VALID_PERIODIC_INPUT.quizVersion,
    quizKind: "placement",
    quizTitle: PERIODIC_TABLE_QUIZ.title,
    subject: PERIODIC_TABLE_QUIZ.subject,
    studentUid: ANON_AUTH.uid,
    studentId: STUDENT.studentId,
    studentCode: STUDENT.studentCode,
    studentName: STUDENT.studentName,
    submittedAt: NOW,
  };

  for (const corruptedResult of [
    {
      resultType: "score",
      score: 100,
      correctCount: 118,
      wrongCount: 0,
      extraSecret: "must-not-leak",
    },
    {
      resultType: "placement",
      completedCount: 118,
    },
  ]) {
    const repository = createMemoryStudentRepository();
    repository.attempts.set(VALID_PERIODIC_INPUT.attemptId, {
      ...base,
      ...corruptedResult,
    });

    await assert.rejects(
      submitAttempt({
        repository,
        auth: ANON_AUTH,
        input: VALID_PERIODIC_INPUT,
        maskedIp: "198.51.100.xxx",
        now: NOW,
      }),
      /attempt-id-conflict/,
    );
  }
});

test("only the documented legacy biology attempt shape receives a canonical retry projection", async () => {
  const repository = createMemoryStudentRepository();
  repository.attempts.set(PERFECT_INPUT.attemptId, {
    quizId: "cell-microscope-quiz1",
    quizTitle: "舊版生物測驗",
    studentUid: ANON_AUTH.uid,
    studentId: STUDENT.studentId,
    studentCode: STUDENT.studentCode,
    studentName: STUDENT.studentName,
    submittedAt: NOW,
    score: 100,
    correctCount: 20,
    wrongCount: 0,
    extraSecret: "must-not-leak",
  });

  assert.deepEqual(await submitAttempt({
    repository,
    auth: ANON_AUTH,
    input: {
      ...PERFECT_INPUT,
      questionOrder: [],
      optionOrder: {},
      answers: { unknown: "not-an-option" },
      reviewProgress: { unknown: {} },
    },
    maskedIp: "198.51.100.xxx",
    now: NOW,
  }), {
    attemptId: PERFECT_INPUT.attemptId,
    quizId: QUIZ_ID,
    quizVersion: QUIZ_VERSION,
    quizKind: "multiple-choice",
    quizTitle: QUIZ_DEFINITION.title,
    subject: QUIZ_DEFINITION.subject,
    studentUid: ANON_AUTH.uid,
    studentId: STUDENT.studentId,
    studentCode: STUDENT.studentCode,
    studentName: STUDENT.studentName,
    submittedAt: NOW,
    resultType: "score",
    score: 100,
    correctCount: 20,
    wrongCount: 0,
  });

  repository.attempts.set("attempt-english-legacy-like", {
    quizId: ENGLISH_REVIEW_2.id,
    studentId: STUDENT.studentId,
    score: 100,
    correctCount: 40,
    wrongCount: 0,
  });
  await assert.rejects(
    submitAttempt({
      repository,
      auth: ANON_AUTH,
      input: {
        ...PERFECT_INPUT,
        attemptId: "attempt-english-legacy-like",
        quizId: ENGLISH_REVIEW_2.id,
        quizVersion: ENGLISH_REVIEW_2.version,
      },
      maskedIp: "198.51.100.xxx",
      now: NOW,
    }),
    /attempt-id-conflict/,
  );
});

test("a stale delayed save conflicts and cannot restore a completed attempt", async () => {
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

  await assert.rejects(
    saveProgress({
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
    }),
    /progress-conflict/,
  );

  assert.deepEqual(
    repository.progress.get(`${STUDENT.studentId}/${QUIZ_ID}`),
    completedProgress,
  );
  assert.equal(completedProgress.activeAttempt, null);
  assert.deepEqual(completedProgress.reviewProgress, REVIEW_PROGRESS);
});

test("a delayed save conflicts with a completed attempt from another version or kind", async () => {
  for (const mismatchedIdentity of [
    { quizVersion: QUIZ_VERSION + 1 },
    { quizKind: "placement" },
  ]) {
    const repository = createMemoryStudentRepository();
    await submitAttempt({
      repository,
      auth: ANON_AUTH,
      input: PERFECT_INPUT,
      maskedIp: "203.0.113.xxx",
      now: NOW,
    });
    repository.attempts.set(PERFECT_INPUT.attemptId, {
      ...repository.attempts.get(PERFECT_INPUT.attemptId),
      ...mismatchedIdentity,
    });

    await assert.rejects(
      saveProgress({
        repository,
        auth: ANON_AUTH,
        input: {
          ...VALID_PROGRESS_INPUT,
          baseRevision: 1,
          activeAttempt: { ...ACTIVE_ATTEMPT, attemptId: PERFECT_INPUT.attemptId },
        },
        now: new Date("2026-08-02T06:05:06.000Z"),
      }),
      /attempt-id-conflict/,
    );
  }
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

const Q1 = QUIZ_DEFINITION.questions[0];
const Q1_CORRECT = Q1.options.find(({ correct }) => correct).id;
const Q2 = QUIZ_DEFINITION.questions[1];

function gradeInput(answers) {
  return {
    studentCode: STUDENT.studentCode,
    studentName: STUDENT.studentName,
    quizId: QUIZ_ID,
    quizVersion: QUIZ_VERSION,
    answers,
  };
}

test("gradeAnswers requires anonymous authentication", async () => {
  await assert.rejects(
    gradeAnswers({
      repository: createMemoryStudentRepository(),
      auth: null,
      input: gradeInput({ [Q1.id]: Q1_CORRECT }),
    }),
    /anonymous-auth-required/,
  );
});

test("gradeAnswers returns per-question correctness, correct option and explanation without recording anything", async () => {
  const repository = createMemoryStudentRepository();
  const { verdicts } = await gradeAnswers({
    repository,
    auth: ANON_AUTH,
    input: gradeInput({ [Q1.id]: Q1_CORRECT, [Q2.id]: Q2.options.find(({ correct }) => !correct).id }),
  });

  assert.deepEqual(verdicts[Q1.id], {
    correct: true,
    correctOptionId: Q1_CORRECT,
    explanation: Q1.explanation,
  });
  assert.equal(verdicts[Q2.id].correct, false);
  assert.equal(verdicts[Q2.id].correctOptionId, Q2.options.find(({ correct }) => correct).id);
  // read-only: nothing persisted
  assert.equal(repository.attempts.size, 0);
  assert.equal(repository.privateAttempts.size, 0);
  assert.equal(repository.progress.size, 0);
  assert.equal(repository.transactionRuns, 0);
});

test("gradeAnswers verifies the student identity and active status", async () => {
  await assert.rejects(
    gradeAnswers({
      repository: createMemoryStudentRepository({ inactiveStudents: [OTHER_STUDENT], approvedStudents: [] }),
      auth: ANON_AUTH,
      input: { ...gradeInput({ [Q1.id]: Q1_CORRECT }), ...OTHER_STUDENT },
    }),
    /student-inactive/,
  );
  await assert.rejects(
    gradeAnswers({
      repository: createMemoryStudentRepository(),
      auth: ANON_AUTH,
      input: { ...gradeInput({ [Q1.id]: Q1_CORRECT }), studentCode: "00000000-000", studentName: "查無此人" },
    }),
    /student-entry-not-found/,
  );
});

test("gradeAnswers rejects unknown questions, invalid options, empty and oversized answer sets", async () => {
  const repository = createMemoryStudentRepository();
  const cases = [
    { unknownQuestion: Q1_CORRECT },
    { [Q1.id]: "not-an-option" },
    {},
    Object.fromEntries(QUIZ_DEFINITION.questions.map((q) => [q.id, q.options[0].id]).concat([["extra", "x"]])),
  ];
  for (const answers of cases) {
    await assert.rejects(
      gradeAnswers({ repository, auth: ANON_AUTH, input: gradeInput(answers) }),
      /invalid-submission/,
    );
  }
});

test("gradeAnswers refuses non multiple-choice quizzes", async () => {
  await assert.rejects(
    gradeAnswers({
      repository: createMemoryStudentRepository(),
      auth: ANON_AUTH,
      input: {
        studentCode: STUDENT.studentCode,
        studentName: STUDENT.studentName,
        quizId: "periodic-table",
        quizVersion: PERIODIC_TABLE_QUIZ.version,
        answers: { anything: "x" },
      },
    }),
    /invalid-submission/,
  );
});
