# Cloud Progress, Safe Delete, and Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure cross-device student progress, immutable server-scored attempts with admin-only masked IP, and administrator-only safe student deletion/deactivation.

**Architecture:** Firebase Gen 2 callable functions in `asia-east1` become the only write boundary for student progress, completed attempts, private IP metadata, and safe deletion. Shared versioned quiz definitions let the browser render randomized questions while the server independently validates and scores stable question/option IDs; Firestore Rules deny direct client writes to server-managed data and isolate `attemptPrivate` to the verified administrator.

**Tech Stack:** React 19, Vite 8, Firebase JS SDK 12, Firebase Functions Gen 2, Firebase Admin SDK, Cloud Firestore, Node 22 test runner, Firestore Emulator, oxlint.

## Global Constraints

- A student authenticates to callable functions with Firebase anonymous auth plus exact approved `studentCode` and `studentName`; caller-provided `studentId` is never trusted.
- Progress is keyed by approved `studentId + quizId` and must resume across browsers/devices while keeping each attempt's randomized order stable.
- Every completed attempt is immutable and idempotent by client-generated `attemptId`; the server recomputes the score from the versioned quiz definition.
- Only masked IP is stored: IPv4 `a.b.c.xxx`, IPv6 first three non-empty hextets plus `…`, otherwise `無法判定`; full IP is never written or logged.
- `attemptPrivate` is readable only by the verified administrator `beyle931224@gmail.com`; teachers and parents cannot read it.
- Only the verified administrator can remove students: no attempts means permanent cleanup, any attempt means deactivate while preserving history and review state.
- Daily student-code counters are never decremented or reused.
- Offline work is written locally first; a successful server acknowledgement is required before pending submission data is cleared.
- External deployment, Billing activation, and budget creation require explicit user approval after local/emulator verification.

---

### Task 1: Versioned Shared Quiz Contract

**Files:**
- Create: `functions/shared/quizDefinition.js`
- Create: `functions/shared/quizSubmissionDomain.js`
- Modify: `src/App.jsx`
- Modify: `src/quizRandomization.js`
- Test: `test/quiz-submission-domain.test.mjs`
- Test: `test/quiz-randomization.test.mjs`

**Interfaces:**
- Produces: `QUIZ_DEFINITION`, `QUIZ_ID`, `QUIZ_VERSION`, `QUIZ_TITLE`, `getQuizDefinition(quizId, version)`.
- Produces: `prepareQuiz()` output options shaped as `{ id: string, text: string, isCorrect: boolean }` and answers shaped as `{ [questionId]: optionId }`.
- Produces: `validateAndScoreSubmission({ quizId, quizVersion, questionOrder, optionOrder, answers })` returning `{ correctCount, wrongCount, score, wrongIds }` or throwing a stable validation error.

- [ ] **Step 1: Write failing contract tests**

```js
test("server scoring ignores caller supplied score and uses stable option IDs", () => {
  const result = validateAndScoreSubmission({
    quizId: QUIZ_ID,
    quizVersion: QUIZ_VERSION,
    questionOrder: QUIZ_DEFINITION.questions.map(({ id }) => id),
    optionOrder: Object.fromEntries(
      QUIZ_DEFINITION.questions.map((q) => [q.id, q.options.map((o) => o.id)]),
    ),
    answers: Object.fromEntries(
      QUIZ_DEFINITION.questions.map((q) => [q.id, q.options.find((o) => o.correct).id]),
    ),
  });
  assert.equal(result.correctCount, QUIZ_DEFINITION.questions.length);
  assert.equal(result.score, 100);
});

test("unknown question and option IDs are rejected", () => {
  assert.throws(
    () => validateAndScoreSubmission({
      quizId: QUIZ_ID,
      quizVersion: QUIZ_VERSION,
      questionOrder: ["not-a-question"],
      optionOrder: { "not-a-question": ["not-an-option"] },
      answers: { "not-a-question": "not-an-option" },
    }),
    /invalid-submission/,
  );
});
```

- [ ] **Step 2: Run the tests and confirm RED**

Run: `node --test test/quiz-submission-domain.test.mjs test/quiz-randomization.test.mjs`

Expected: FAIL because the shared quiz modules, stable option IDs, and `validateAndScoreSubmission` do not exist.

- [ ] **Step 3: Move the current 20 questions into the versioned definition and implement validation/scoring**

```js
export const QUIZ_ID = "cell-microscope-quiz1";
export const QUIZ_VERSION = 1;
export const QUIZ_TITLE = "第1回 第1、2單元｜細胞與顯微鏡";
export const QUIZ_DEFINITION = {
  id: QUIZ_ID,
  version: QUIZ_VERSION,
  title: QUIZ_TITLE,
  questions: RAW_QUESTIONS.map((question) => ({
    ...question,
    options: question.options.map((text, index) => ({
      id: `${question.id}-o${index + 1}`,
      text,
      correct: index === question.correct,
    })),
  })),
};
```

Implement exact set equality checks for every question and option order, require exactly one legal answer per question at submission, and compute the score from `correct` flags. Remove the in-file `QUESTIONS`, `QUIZ_ID`, and `QUIZ_TITLE` constants from `App.jsx` and import the shared values.

- [ ] **Step 4: Run focused and regression tests**

Run: `node --test test/quiz-submission-domain.test.mjs test/quiz-randomization.test.mjs test/quiz-attempt-lifecycle.test.mjs test/quiz-domain.test.mjs`

Expected: PASS; randomized display order remains deterministic under injected random functions, and answers use option IDs rather than display indexes.

- [ ] **Step 5: Commit the shared contract**

```bash
git add functions/shared/quizDefinition.js functions/shared/quizSubmissionDomain.js src/App.jsx src/quizRandomization.js test/quiz-submission-domain.test.mjs test/quiz-randomization.test.mjs test/quiz-attempt-lifecycle.test.mjs
git commit -m "Add versioned quiz submission contract"
```

---

### Task 2: Functions Scaffold and Pure Security Domains

**Files:**
- Create: `functions/package.json`
- Create: `functions/package-lock.json`
- Create: `functions/index.js`
- Create: `functions/studentIdentity.js`
- Create: `functions/ipMask.js`
- Create: `functions/progressDomain.js`
- Create: `functions/adminIdentity.js`
- Create: `functions/test/ip-mask.test.mjs`
- Create: `functions/test/progress-domain.test.mjs`
- Create: `functions/test/admin-identity.test.mjs`
- Modify: `firebase.json`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `maskIp(rawIp): string`.
- Produces: `requireStudentIdentity(db, { studentCode, studentName }): Promise<{ studentId, studentCode, studentName }>`.
- Produces: `normalizeProgressPayload(input, quizDefinition)` returning the whitelisted progress document fields.
- Produces: `requireAdminAuth(auth)` accepting only verified Google auth for `beyle931224@gmail.com`.

- [ ] **Step 1: Add failing pure-domain tests**

```js
test("masks IPv4, IPv6, forwarded values, and unknown input", () => {
  assert.equal(maskIp("203.0.113.42"), "203.0.113.xxx");
  assert.equal(maskIp("2001:db8:85a3::8a2e:370:7334"), "2001:db8:85a3:…");
  assert.equal(maskIp("203.0.113.42, 10.0.0.1"), "203.0.113.xxx");
  assert.equal(maskIp(undefined), "無法判定");
});

test("requires the verified Google administrator", () => {
  assert.doesNotThrow(() => requireAdminAuth({
    token: { email: "beyle931224@gmail.com", email_verified: true, firebase: { sign_in_provider: "google.com" } },
  }));
  assert.throws(() => requireAdminAuth({ token: { email: "teacher@example.com", email_verified: true } }), /admin-required/);
});
```

- [ ] **Step 2: Run Functions tests and confirm RED**

Run: `npm --prefix functions test`

Expected: FAIL because the Functions package and domain modules do not exist.

- [ ] **Step 3: Scaffold Node 22 Functions and implement minimal domains**

Use dependencies `firebase-admin` and `firebase-functions`. Keep the quiz definition and scoring domain in `functions/shared/` so the deployed Functions package owns them; the Vite frontend imports the same source files and bundles them at build time. Configure Gen 2 callables with:

```js
const CALLABLE_OPTIONS = {
  region: "asia-east1",
  maxInstances: 3,
  timeoutSeconds: 30,
  memory: "256MiB",
};
```

Add `functions: [{ source: "functions", codebase: "default", ignore: ["node_modules", ".git", "firebase-debug.log", "firebase-debug.*.log"] }]` and Functions emulator port `5001` to `firebase.json`. Implement strict trimming, code pattern `/^\d{8}-\d{3}$/`, name length 1–40 with no slash, payload key whitelists, and never log raw request headers/IP.

- [ ] **Step 4: Run Functions tests and lint**

Run: `npm --prefix functions test`

Run: `npm run lint`

Expected: PASS with no warnings from project code.

- [ ] **Step 5: Commit the trusted runtime foundation**

```bash
git add functions firebase.json .gitignore
git commit -m "Add secure Firebase Functions foundation"
```

---

### Task 3: Callable Progress and Idempotent Attempt Services

**Files:**
- Create: `functions/studentService.js`
- Create: `functions/firestoreStudentRepository.js`
- Create: `functions/test/student-service.test.mjs`
- Modify: `functions/index.js`
- Modify: `firestore.rules`
- Modify: `test/firestore.rules.test.mjs`

**Interfaces:**
- Produces callables: `loadStudentProgress`, `saveStudentProgress`, `submitQuizAttempt`.
- Produces service signatures:
  - `loadProgress({ repository, auth, input })`.
  - `saveProgress({ repository, auth, input, now })`.
  - `submitAttempt({ repository, auth, input, maskedIp, now })`.
- Consumes Task 1 scoring contract and Task 2 identity/payload/IP domains.

- [ ] **Step 1: Write failing service tests with an in-memory repository**

```js
test("the same attemptId is committed once and returns the stored result on retry", async () => {
  const repository = createMemoryStudentRepository({ approvedStudent: STUDENT });
  const first = await submitAttempt({ repository, auth: ANON_AUTH, input: PERFECT_INPUT, maskedIp: "203.0.113.xxx", now: NOW });
  const second = await submitAttempt({ repository, auth: ANON_AUTH, input: PERFECT_INPUT, maskedIp: "198.51.100.xxx", now: NOW });
  assert.equal(first.attemptId, PERFECT_INPUT.attemptId);
  assert.deepEqual(second, first);
  assert.equal(repository.attempts.size, 1);
  assert.equal(repository.privateAttempts.get(PERFECT_INPUT.attemptId).maskedIp, "203.0.113.xxx");
});

test("saving one student never writes another student path", async () => {
  const repository = createMemoryStudentRepository({ approvedStudent: STUDENT });
  await saveProgress({ repository, auth: ANON_AUTH, input: VALID_PROGRESS_INPUT, now: NOW });
  assert.deepEqual([...repository.progress.keys()], [`${STUDENT.studentId}/${QUIZ_ID}`]);
});
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm --prefix functions test -- --test-name-pattern="attemptId|student path|progress"`

Expected: FAIL because the services and repositories do not exist.

- [ ] **Step 3: Implement transaction-backed services**

`submitAttempt` must perform one Firestore transaction that:

1. Resolves the approved student from code/name and rejects inactive entries.
2. Reads `quizAttempts/{attemptId}`; if present and owned by the same student/quiz, returns it without new writes; mismatched reuse throws `attempt-id-conflict`.
3. Validates all question/option IDs and recomputes score from the shared definition.
4. Creates `quizAttempts/{attemptId}` and `attemptPrivate/{attemptId}` with the same ID.
5. Merges updated `reviewProgress` and sets `activeAttempt: null` in `studentProgress/{studentId}/quizzes/{quizId}`.

The callable obtains raw IP only from `request.rawRequest.ip` or the first `x-forwarded-for` value, immediately calls `maskIp`, and passes only the masked result into the service.

- [ ] **Step 4: Lock down direct Firestore access and add Rules tests**

```js
await assertFails(setDoc(doc(studentDb, "studentProgress/student-1/quizzes/quiz-1"), { activeAttempt: {} }));
await assertFails(setDoc(doc(studentDb, "quizAttempts/direct-write"), validAttempt));
await assertFails(getDoc(doc(teacherDb, "attemptPrivate/existing-student-1")));
await assertFails(getDoc(doc(parentDb, "attemptPrivate/existing-student-1")));
await assertSucceeds(getDoc(doc(adminDb, "attemptPrivate/existing-student-1")));
```

Add an emulator seed for `attemptPrivate/existing-student-1`. Remove the old client-create allowance on `quizAttempts`; deny client reads/writes to `studentProgress`; allow only verified admin reads and no client writes for `attemptPrivate`.

- [ ] **Step 5: Run service and Rules suites**

Run: `npm --prefix functions test`

Run: `npm run test:rules`

Expected: PASS, including idempotency, invalid credentials, inactive student, invalid payload, private IP isolation, and direct-write rejection.

- [ ] **Step 6: Commit server-managed progress and attempts**

```bash
git add functions/studentService.js functions/firestoreStudentRepository.js functions/index.js functions/test/student-service.test.mjs firestore.rules test/firestore.rules.test.mjs
git commit -m "Add server-managed student progress and attempts"
```

---

### Task 4: Offline-First Client Sync Domain

**Files:**
- Create: `src/studentSyncDomain.js`
- Create: `src/studentFunctions.js`
- Create: `test/student-sync-domain.test.mjs`
- Modify: `src/firebase.js`

**Interfaces:**
- Produces `createLocalProgressStore(storage)` with `load(key)`, `save(key, value)`, and `remove(key)`.
- Produces `resolveProgressConflict({ local, cloud })` returning `{ mode: "local" | "cloud" | "choice", value?, local?, cloud? }`.
- Produces `createStudentSyncClient({ functions, debounceMs })` exposing `load`, `queueSave`, `flush`, and `submit`.
- Produces callable wrappers `loadStudentProgress(input)`, `saveStudentProgress(input)`, `submitQuizAttempt(input)`.

- [ ] **Step 1: Write failing offline and conflict tests**

```js
test("newer unsynced local work requires an explicit choice", () => {
  const result = resolveProgressConflict({
    local: { updatedAtMs: 2000, pendingSync: true, activeAttempt: { answers: { q1: "q1-o1" } } },
    cloud: { updatedAtMs: 1000, activeAttempt: { answers: {} } },
  });
  assert.equal(result.mode, "choice");
});

test("pending submission is removed only after server acknowledgement", async () => {
  const storage = createMemoryStorage();
  const client = createStudentSyncClient({ callSubmit: async () => ({ attemptId: "run-1" }), storage, debounceMs: 0 });
  storage.setItem("pending:student-1:quiz-1", JSON.stringify({ attemptId: "run-1" }));
  await client.submit("student-1:quiz-1");
  assert.equal(storage.getItem("pending:student-1:quiz-1"), null);
});
```

- [ ] **Step 2: Run the sync tests and confirm RED**

Run: `node --test test/student-sync-domain.test.mjs`

Expected: FAIL because the local store, conflict resolver, and sync client do not exist.

- [ ] **Step 3: Implement Firebase Functions client and local-first queue**

Initialize Functions from the same Firebase app with region `asia-east1`. Replace direct `loadProgress`, `saveProgress`, `validateStudentEntry`, and `saveQuizAttempt` exports in `src/firebase.js` with the callable wrappers while keeping `ensureSignedIn()`.

Use storage keys:

```text
jhst:progress:<studentId>:<quizId>
jhst:pending-attempt:<studentId>:<quizId>
```

Each local snapshot contains `updatedAtMs`, `pendingSync`, `activeAttempt`, and `reviewProgress`. Debounced saves must coalesce to the latest snapshot, `flush()` must await the active request, and failures must leave `pendingSync: true`.

- [ ] **Step 4: Run sync, Firebase configuration, and build-entry tests**

Run: `node --test test/student-sync-domain.test.mjs test/pages-deployment.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the client synchronization layer**

```bash
git add src/studentSyncDomain.js src/studentFunctions.js src/firebase.js test/student-sync-domain.test.mjs
git commit -m "Add offline-first student sync client"
```

---

### Task 5: Cross-Device Quiz Experience and Accurate Status

**Files:**
- Create: `src/SyncStatus.jsx`
- Create: `src/ProgressConflictDialog.jsx`
- Modify: `src/App.jsx`
- Modify: `src/quizAttemptLifecycle.js`
- Test: `test/quiz-attempt-lifecycle.test.mjs`
- Test: `test/student-sync-domain.test.mjs`

**Interfaces:**
- Consumes Tasks 1 and 4 stable option-ID questions and sync client.
- Produces visible states `loading`, `synced`, `local-pending`, `conflict`, `submitting`, and `submit-failed`.

- [ ] **Step 1: Add failing lifecycle tests for restored attempts**

```js
test("restores the exact question and option order from cloud progress", () => {
  const lifecycle = createQuizAttemptLifecycle();
  const restored = lifecycle.restoreAttempt(QUIZ_DEFINITION.questions, STORED_ORDER);
  assert.deepEqual(restored.questions.map((q) => q.id), STORED_ORDER.questionOrder);
  assert.deepEqual(restored.questions[0].options.map((o) => o.id), STORED_ORDER.optionOrder[restored.questions[0].id]);
});
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `node --test test/quiz-attempt-lifecycle.test.mjs test/student-sync-domain.test.mjs`

Expected: FAIL because `restoreAttempt` and the UI state transitions do not exist.

- [ ] **Step 3: Integrate identity validation, restore, local saves, and completion**

On Start:

1. Validate local input format and anonymously authenticate.
2. Call `loadStudentProgress({ studentCode, studentName, quizId, quizVersion })`.
3. Store returned `studentId` only after server validation.
4. Restore exact cloud/local order or show `ProgressConflictDialog` when `mode === "choice"`.

On every answer/navigation change, save locally before queueing the cloud call. On Finish, persist the full pending submission locally, call `submitQuizAttempt`, and only then clear the pending submission and render `紀錄已保存`. If submission fails, retain results plus a `重新送出` button.

Replace the generic warning with distinct messages:

```text
Firebase 設定缺少，暫時只能保存在這個瀏覽器。
網路連線中斷；進度已保存在這個瀏覽器，連線後會再同步。
雲端拒絕存取，請重新輸入學生姓名與專屬代碼。
這名學生已停用，無法開始新的測驗。
```

- [ ] **Step 4: Verify UI regressions and production build**

Run: `npm test`

Run: `npm run lint`

Run: `npm run build`

Expected: all tests pass, lint exits 0, and `dist/quiz.html` builds without unresolved Functions imports.

- [ ] **Step 5: Commit the cross-device experience**

```bash
git add src/App.jsx src/SyncStatus.jsx src/ProgressConflictDialog.jsx src/quizAttemptLifecycle.js test/quiz-attempt-lifecycle.test.mjs test/student-sync-domain.test.mjs
git commit -m "Add cross-device quiz progress experience"
```

---

### Task 6: Admin-Only Masked IP Display

**Files:**
- Create: `src/attemptPrivateDomain.js`
- Modify: `src/teacherFirebase.js`
- Modify: `src/TeacherApp.jsx`
- Create: `test/attempt-private-domain.test.mjs`

**Interfaces:**
- Produces `mergeAttemptsWithPrivate(attempts, privateRecords)` returning attempts with `maskedIp` or `無法判定`.
- Produces `listAttemptPrivate(attemptIds)` guarded by `requireAdmin()`.

- [ ] **Step 1: Write failing merge and visibility tests**

```js
test("private metadata joins by attempt ID without changing attempt order", () => {
  const merged = mergeAttemptsWithPrivate(
    [{ id: "a2" }, { id: "a1" }],
    [{ id: "a1", maskedIp: "203.0.113.xxx" }],
  );
  assert.deepEqual(merged.map((item) => item.id), ["a2", "a1"]);
  assert.equal(merged[0].maskedIp, "無法判定");
  assert.equal(merged[1].maskedIp, "203.0.113.xxx");
});
```

- [ ] **Step 2: Run test and confirm RED**

Run: `node --test test/attempt-private-domain.test.mjs`

Expected: FAIL because the merge domain does not exist.

- [ ] **Step 3: Implement admin loading and table column**

For administrator views, fetch private documents in batches of document IDs supported by Firestore `in` queries, merge by attempt ID, and render an `IP` header/cell. Do not call `listAttemptPrivate` for teacher or parent states; their tables remain `時間／學生／試卷／成績`.

- [ ] **Step 4: Run domain, Rules, and portal tests**

Run: `node --test test/attempt-private-domain.test.mjs test/teacher-domain.test.mjs test/admin-mode-domain.test.mjs`

Run: `npm run test:rules`

Expected: PASS and Rules prove teacher/parent reads fail.

- [ ] **Step 5: Commit private audit display**

```bash
git add src/attemptPrivateDomain.js src/teacherFirebase.js src/TeacherApp.jsx test/attempt-private-domain.test.mjs
git commit -m "Show masked attempt IP to administrators"
```

---

### Task 7: Administrator Safe Delete and Deactivate

**Files:**
- Create: `functions/adminStudentService.js`
- Create: `functions/test/admin-student-service.test.mjs`
- Modify: `functions/firestoreStudentRepository.js`
- Modify: `functions/index.js`
- Create: `src/SafeStudentRemovalDialog.jsx`
- Create: `src/safeStudentRemovalDomain.js`
- Modify: `src/studentFunctions.js`
- Modify: `src/teacherFirebase.js`
- Modify: `src/TeacherApp.jsx`
- Create: `test/safe-student-removal-domain.test.mjs`

**Interfaces:**
- Produces callable `removeOrDeactivateStudent({ studentId })`.
- Produces result `{ action: "deleted" | "deactivated", studentId, studentName, studentCode }`.
- Produces `getRemovalConfirmation(student)` with exact confirmation copy and button label.

- [ ] **Step 1: Write failing server decision tests**

```js
test("a student without attempts is fully deleted and the code is not recycled", async () => {
  const repository = createAdminStudentRepository({ student: STUDENT, attempts: [] });
  const result = await removeOrDeactivateStudent({ repository, auth: ADMIN_AUTH, studentId: STUDENT.id });
  assert.equal(result.action, "deleted");
  assert.equal(repository.students.has(STUDENT.id), false);
  assert.equal(repository.entries.has(`${STUDENT.code}/${STUDENT.name}`), false);
  assert.equal(repository.counter.nextSequence, 3);
});

test("a student with attempts is deactivated and history remains", async () => {
  const repository = createAdminStudentRepository({ student: STUDENT, attempts: [{ id: "attempt-1", studentId: STUDENT.id }] });
  const result = await removeOrDeactivateStudent({ repository, auth: ADMIN_AUTH, studentId: STUDENT.id });
  assert.equal(result.action, "deactivated");
  assert.equal(repository.students.get(STUDENT.id).active, false);
  assert.equal(repository.attempts.size, 1);
  assert.equal(repository.progress.get(STUDENT.id).activeAttempt, null);
  assert.ok(repository.progress.get(STUDENT.id).reviewProgress);
});
```

- [ ] **Step 2: Run server tests and confirm RED**

Run: `npm --prefix functions test -- --test-name-pattern="deleted|deactivated|administrator"`

Expected: FAIL because the admin removal service does not exist.

- [ ] **Step 3: Implement verified-admin cleanup/deactivation**

The repository queries `quizAttempts` by `studentId` with limit 1. Permanent cleanup deletes student, exact entry path, every `adminStudentLinks/*/students/{studentId}` link, progress, and removes the ID from every matching `viewerAccess.studentIds`; it never updates `dailyCounters`. Deactivation sets both student and entry `active: false`, clears only `activeAttempt`, and preserves attempts, private metadata, review progress, code, and parent history access.

- [ ] **Step 4: Write failing confirmation-domain test**

```js
test("confirmation names the student and code and never promises hard deletion", () => {
  const confirmation = getRemovalConfirmation({ name: "劉宥巧", code: "20260802-002" });
  assert.match(confirmation.message, /劉宥巧/);
  assert.match(confirmation.message, /20260802-002/);
  assert.match(confirmation.message, /有測驗紀錄時只會停用/);
  assert.equal(confirmation.confirmLabel, "確認刪除或停用");
});
```

- [ ] **Step 5: Run UI-domain test and confirm RED**

Run: `node --test test/safe-student-removal-domain.test.mjs`

Expected: FAIL because the confirmation domain does not exist.

- [ ] **Step 6: Add student-card action, modal, and refresh behavior**

Show the action only in administrator student management. Disable it while working, require the explicit confirmation dialog, announce whether the backend deleted or deactivated, then reload administrator students and attempts. A failure leaves the card and dialog data intact and displays `刪除／停用未完成，資料未確認變更，請稍後重試。`.

- [ ] **Step 7: Run all Functions and frontend tests**

Run: `npm --prefix functions test`

Run: `npm test`

Run: `npm run lint`

Expected: PASS, including non-admin rejection, no-attempt deletion, with-attempt deactivation, exact confirmation copy, and existing admin creation flows.

- [ ] **Step 8: Commit safe student removal**

```bash
git add functions/adminStudentService.js functions/firestoreStudentRepository.js functions/index.js functions/test/admin-student-service.test.mjs src/SafeStudentRemovalDialog.jsx src/safeStudentRemovalDomain.js src/studentFunctions.js src/teacherFirebase.js src/TeacherApp.jsx test/safe-student-removal-domain.test.mjs
git commit -m "Add administrator safe student removal"
```

---

### Task 8: CI, Emulator Integration, Documentation, and Deployment Gate

**Files:**
- Create: `functions/test/emulator-integration.test.mjs`
- Modify: `.github/workflows/deploy-pages.yml`
- Modify: `firebase.json`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `.env.example`
- Test: `test/pages-deployment.test.mjs`

**Interfaces:**
- Produces root scripts `test:functions`, `test:emulators`, and `verify`.
- Produces a CI build that installs and tests both root and Functions packages but deploys Pages only; Functions/Rules production deployment remains a separately approved manual command.

- [ ] **Step 1: Add failing CI/deployment contract assertions**

```js
assert.match(workflow, /npm --prefix functions ci/);
assert.match(workflow, /npm --prefix functions test/);
assert.match(workflow, /npm run test:emulators/);
assert.doesNotMatch(workflow, /firebase deploy --only functions/);
```

- [ ] **Step 2: Run deployment tests and confirm RED**

Run: `node --test test/pages-deployment.test.mjs`

Expected: FAIL because CI does not install/test Functions or run the combined emulators.

- [ ] **Step 3: Add combined emulator verification and documentation**

Configure Auth emulator `9099`, Functions emulator `5001`, and Firestore emulator `8080`. Add:

```json
{
  "test:functions": "npm --prefix functions test",
  "test:emulators": "firebase emulators:exec --only auth,firestore,functions \"node --test functions/test/emulator-integration.test.mjs test/firestore.rules.test.mjs\"",
  "verify": "npm test && npm run test:functions && npm run test:emulators && npm run lint && npm run build"
}
```

The integration test must create an approved test student with Rules disabled, call the local callable endpoints as an anonymous authenticated user, resume from a second anonymous user, submit one attempt twice, and verify exactly one public attempt, one private masked-IP document, retained review progress, and cleared `activeAttempt`.

Update README with data collections, local Functions install/emulator commands, region `asia-east1`, masked-IP privacy, safe-delete behavior, and the production deployment gate. Do not place service-account keys in GitHub Variables or the repository.

- [ ] **Step 4: Run the complete local verification**

Run: `npm ci`

Run: `npm --prefix functions ci`

Run: `npm run verify`

Expected: all unit tests and emulator tests pass, lint exits 0, production build succeeds, and no production Firebase resources are changed.

- [ ] **Step 5: Inspect production prerequisites without changing them**

Run: `firebase use`

Run: `firebase functions:list --project junior-high-school-test`

Run: `gcloud firestore databases describe --database='(default)' --project=junior-high-school-test --format='value(locationId)'`

Expected: project is `junior-high-school-test`; record the existing Functions and Firestore region. If the database region makes `asia-east1` inappropriate, stop before deployment and revise `CALLABLE_OPTIONS` plus the client region together, then rerun `npm run verify`.

- [ ] **Step 6: Commit CI and operator documentation**

```bash
git add functions/test/emulator-integration.test.mjs .github/workflows/deploy-pages.yml firebase.json package.json README.md .env.example test/pages-deployment.test.mjs
git commit -m "Verify cloud progress deployment workflow"
```

- [ ] **Step 7: Present the production change set and request approval**

Show the user:

```text
Functions: loadStudentProgress, saveStudentProgress, submitQuizAttempt, removeOrDeactivateStudent
Region: asia-east1 (or the verified Firestore-compatible region)
maxInstances: 3 per function
Rules: deny direct student progress/attempt writes; admin-only attemptPrivate reads
Billing: report whether Blaze/Billing is already enabled; do not enable it automatically
Budget: recommend a low monthly alert amount; warn that alerts do not cap charges
```

Do not run deployment until the user explicitly approves this exact external change.

- [ ] **Step 8: After approval only, deploy Functions and Rules, then Pages**

Run: `firebase deploy --only functions,firestore:rules --project junior-high-school-test`

Run: `git push origin main`

Expected: Firebase reports all four callables deployed and Rules released; GitHub Actions completes successfully.

- [ ] **Step 9: Perform public end-to-end verification**

Using disposable test students only:

1. Device/browser A answers part of a quiz and shows `已同步`.
2. Device/browser B enters the same code/name and restores exact order, position, and answers.
3. Submit once and retry the same pending payload; only one completed attempt exists.
4. Administrator sees time, masked IP, student, code, quiz, and score.
5. Teacher and authorized parent see the permitted attempt but cannot retrieve IP.
6. A no-attempt test student is permanently removed; an attempted test student is deactivated and historical records remain.
7. Confirm no full IP appears in Firestore documents or available application logs inspected during the test.

- [ ] **Step 10: Record verification evidence and final commit if documentation changed**

If README needs only factual deployment details such as verified region or command output, update those exact facts and commit:

```bash
git add README.md
git commit -m "Document verified Firebase deployment"
```

Otherwise do not create an empty commit.
