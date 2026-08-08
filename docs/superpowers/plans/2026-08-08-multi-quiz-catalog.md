# Multi-Quiz Catalog and Shared Records Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add biology, English Review 2, and periodic-table choices to the student quiz catalog while preserving each quiz's interaction style and sharing secure cross-device progress, immutable attempts, role-scoped records, safe deletion, and admin-only masked IP.

**Architecture:** Extend the un-deployed Functions foundation already on this feature branch from one hard-coded multiple-choice definition to a versioned quiz registry with kind-specific progress and submission validators. A shared React student shell owns identity, offline-first synchronization, conflicts, and navigation; biology, English, and periodic-table modules own only their quiz state and rendering.

**Tech Stack:** React 19, Vite 8, Firebase JS SDK 12, Firebase Functions Gen 2 in Node 22, Firebase Admin SDK, Cloud Firestore, Node test runner, Firestore/Auth/Functions Emulators, oxlint.

**Starting Point:** Commits through `e54107e` contain the reviewed quiz-ID/scoring foundation and the implemented but not yet production-deployed single-quiz Functions transaction service. This plan supersedes Tasks 4–8 of `2026-08-02-cloud-progress-safe-delete-audit.md`; it generalizes that foundation instead of implementing the obsolete single-quiz frontend steps.

## Global Constraints

- Catalog order and stable IDs are exactly: `biology-cell-microscope-1`, `english-review-2`, `periodic-table`.
- All three quizzes require Firebase anonymous auth plus exact active `studentCode + studentName`; caller-provided `studentId`, score, title, subject, kind, and answer key are never trusted.
- Progress is isolated by approved `studentId + quizId`; each attempt's randomized or fixed ordering must restore exactly across devices.
- Biology remains one-question-at-a-time with shuffled question/options and review scheduling.
- English remains one 40-question page in original order: questions 1–20 worth 2 points, 21–40 worth 3 points, total 100; reading passages, controlled SVG, and explanations remain.
- Periodic table keeps 118 elements, randomized pool, desktop drag/drop, mobile click/place, pause, reset, error count, and elapsed time; it has no percentage score.
- Biology and English results are server-scored from versioned definitions. Periodic completion/positions are server-validated; browser error count and duration are informational non-negative bounded statistics.
- Every completed attempt is immutable and idempotent by client attempt ID. The same ID cannot be reused by another student or quiz.
- Only masked IP is stored in `attemptPrivate`; only verified Google admin `beyle931224@gmail.com` can read it.
- Direct client writes to `studentProgress`, `quizAttempts`, and `attemptPrivate` remain denied.
- Student removal is admin-only: any attempt in any quiz means deactivate and preserve history; no attempts means permanent cleanup; counters are never reused.
- Original HTML is reference input only: no iframe, dynamic remote HTML, inline source script execution, or `dangerouslySetInnerHTML`.
- Billing activation and production Functions/Rules/Pages deployment require a separate explicit user approval after all local and emulator checks.

---

### Task 1: Extract and Verify the English Quiz Definition

**Files:**
- Create: `functions/shared/englishReview2Definition.js`
- Create: `functions/shared/englishReview2Scoring.js`
- Create: `src/EnglishQuestionFigure.jsx`
- Create: `test/english-review-2-definition.test.mjs`
- Source reference: `/Users/alex/Downloads/junior-high-school-test/English2.html`

**Interfaces:**
- Produces `ENGLISH_REVIEW_2` with `id`, `version`, `kind`, `subject`, `title`, `catalogDescription`, `readings`, and 40 stable-ID questions.
- Produces `scoreEnglishReview2({ answers })` returning `{ resultType: "score", score, correctCount, wrongCount, wrongIds }`.
- Produces controlled `EnglishQuestionFigure({ figureId })`; only `library-layout-q36` is valid.

- [ ] **Step 1: Write failing definition and scoring tests**

```js
test("English Review 2 preserves forty questions and the original weighting", () => {
  assert.equal(ENGLISH_REVIEW_2.id, "english-review-2");
  assert.equal(ENGLISH_REVIEW_2.questions.length, 40);
  assert.equal(new Set(ENGLISH_REVIEW_2.questions.map((q) => q.id)).size, 40);
  assert.equal(ENGLISH_REVIEW_2.questions.slice(0, 20).reduce((n, q) => n + q.points, 0), 40);
  assert.equal(ENGLISH_REVIEW_2.questions.slice(20).reduce((n, q) => n + q.points, 0), 60);
});

test("the server-owned English answer key scores one hundred", () => {
  const answers = Object.fromEntries(
    ENGLISH_REVIEW_2.questions.map((q) => [q.id, q.options.find((o) => o.correct).id]),
  );
  assert.deepEqual(scoreEnglishReview2({ answers }), {
    resultType: "score", score: 100, correctCount: 40, wrongCount: 0, wrongIds: [],
  });
});
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `node --test test/english-review-2-definition.test.mjs`

Expected: FAIL because the definition/scorer do not exist.

- [ ] **Step 3: Extract source data into stable, inert modules**

Map source IDs `1..40` to `e01..e40`, and option indexes to `eNN-o1..eNN-o4`. Preserve question text, five reading blocks, explanations, and original answer keys. Store `figureId: "library-layout-q36"` instead of HTML. Build the Q36 SVG as JSX with no scripts, external references, inline event handlers, or raw HTML injection.

- [ ] **Step 4: Add validation cases and run GREEN**

Tests must also prove: five reading IDs resolve, question 36 uses the controlled figure ID, every question has four unique options and exactly one correct option, unknown answer IDs reject with `invalid-submission`, and omitted answers count wrong after explicit submission confirmation in the UI task.

Run: `node --test test/english-review-2-definition.test.mjs`

Run: `npm run lint`

Expected: PASS and lint exits 0.

- [ ] **Step 5: Commit**

```bash
git add functions/shared/englishReview2Definition.js functions/shared/englishReview2Scoring.js src/EnglishQuestionFigure.jsx test/english-review-2-definition.test.mjs
git commit -m "Add versioned English Review 2 definition"
```

---

### Task 2: Extract and Verify the Periodic-Table Definition

**Files:**
- Create: `functions/shared/periodicTableDefinition.js`
- Create: `functions/shared/periodicTableSubmission.js`
- Create: `src/periodicTableDomain.js`
- Create: `test/periodic-table-definition.test.mjs`
- Source reference: `/Users/alex/Library/Application Support/Claude/local-agent-mode-sessions/3f4a0227-67e9-4af4-9bf5-575aba943ba8/c5123963-8cc2-4ae9-95e6-962f18119246/local_23f5eb7d-c0f6-4869-bf18-69655945fbd5/outputs/periodic_table_quiz.html`

**Interfaces:**
- Produces `PERIODIC_TABLE_QUIZ` with 118 stable elements and legal positions.
- Produces `validatePeriodicSubmission(input)` returning `{ resultType: "placement", completedCount: 118, totalItems: 118, errorCount, durationSeconds, completed: true }`.
- Produces pure UI functions `createPeriodicAttempt(elements, random)`, `placeElement(state, elementId, targetId)`, `pauseTimer(state, nowMs)`, and `resumeTimer(state, nowMs)`.

- [ ] **Step 1: Write failing element and result tests**

```js
test("the periodic definition contains every atomic number exactly once", () => {
  assert.equal(PERIODIC_TABLE_QUIZ.elements.length, 118);
  assert.deepEqual(
    PERIODIC_TABLE_QUIZ.elements.map((e) => e.atomicNumber).sort((a, b) => a - b),
    Array.from({ length: 118 }, (_, i) => i + 1),
  );
  assert.equal(new Set(PERIODIC_TABLE_QUIZ.elements.map((e) => e.symbol)).size, 118);
});

test("only a complete correct board creates a placement result", () => {
  const placements = Object.fromEntries(PERIODIC_TABLE_QUIZ.elements.map((e) => [e.id, e.targetId]));
  assert.equal(validatePeriodicSubmission({ placements, errorCount: 9, durationSeconds: 755 }).completed, true);
  assert.throws(() => validatePeriodicSubmission({ placements: {}, errorCount: 0, durationSeconds: 1 }), /invalid-submission/);
});
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `node --test test/periodic-table-definition.test.mjs`

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Extract 118 elements and implement strict placement validation**

Preserve atomic number, symbol, Chinese name, English name, category, main/lanthanide/actinide row, column, and a unique `targetId`. `errorCount` must be an integer `0..100000`; `durationSeconds` must be an integer `0..604800`. Reject missing, extra, duplicated, or wrong placements.

- [ ] **Step 4: Implement pure interaction/timer transitions and run GREEN**

Tests cover seeded pool shuffling without mutation, correct placement removal, wrong placement increment without removal, duplicate placement no-op, pause accumulation, resume without counting offline time, and reset to a fresh attempt.

Run: `node --test test/periodic-table-definition.test.mjs`

Run: `npm run lint`

Expected: PASS and lint exits 0.

- [ ] **Step 5: Commit**

```bash
git add functions/shared/periodicTableDefinition.js functions/shared/periodicTableSubmission.js src/periodicTableDomain.js test/periodic-table-definition.test.mjs
git commit -m "Add versioned periodic table definition"
```

---

### Task 3: Generalize the Trusted Quiz Registry and Attempt Service

**Files:**
- Create: `functions/shared/quizRegistry.js`
- Rename: `functions/shared/quizDefinition.js` to `functions/shared/biologyDefinition.js`
- Rename: `functions/shared/quizSubmissionDomain.js` to `functions/shared/multipleChoiceSubmission.js`
- Modify: `functions/progressDomain.js`
- Modify: `functions/studentService.js`
- Modify: `functions/firestoreStudentRepository.js`
- Modify: `functions/index.js`
- Modify: `functions/test/student-service.test.mjs`
- Modify: `functions/test/progress-domain.test.mjs`
- Modify: `firestore.rules`
- Modify: `test/firestore.rules.test.mjs`
- Create: `test/quiz-registry.test.mjs`

**Interfaces:**
- Produces `QUIZ_CATALOG` in exact catalog order and `getQuizDefinition(quizId, version)`.
- Produces `normalizeQuizProgress(definition, input)` dispatching `multiple-choice` and `placement` payloads.
- Produces `validateQuizSubmission(definition, input)` returning one of the two fixed result shapes.
- Extends public attempt documents with trusted `quizVersion`, `quizKind`, `subject`, and `resultType`.

- [ ] **Step 1: Write failing registry and service dispatch tests**

```js
test("catalog exposes three stable quizzes in display order", () => {
  assert.deepEqual(QUIZ_CATALOG.map((q) => q.id), [
    "biology-cell-microscope-1", "english-review-2", "periodic-table",
  ]);
});

test("placement submissions never accept score fields", async () => {
  const input = { ...VALID_PERIODIC_INPUT, score: 100 };
  await assert.rejects(() => submitAttempt(SERVICE_ARGS(input)), /invalid-submission/);
});
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm --prefix functions test`

Run: `node --test test/quiz-registry.test.mjs`

Expected: FAIL because only the old single biology definition is registered.

- [ ] **Step 3: Implement kind-specific progress and result dispatch**

Biology ID changes from `cell-microscope-quiz1` to `biology-cell-microscope-1`; no production data exists on this un-deployed branch, so no migration write is needed. Multiple-choice progress stores stable question/option order, answers, current position, and optional biology review progress. Placement progress stores pool order, placed element IDs, error count, accumulated seconds, and `running|paused` state. Unknown fields or cross-kind fields reject.

- [ ] **Step 4: Preserve transaction guarantees and backward-readable attempts**

The existing transaction must still resolve identity inside the transaction, check idempotency before body scoring, reject same ID used by another student/quiz, server-compute result, create public/private documents with the same ID, and clear only active attempt. Readers tolerate old biology attempts without new metadata, but all new writes use the new shape.

- [ ] **Step 5: Update Rules tests and run full backend verification**

Rules continue to deny direct writes to progress/attempt/private collections and admin-only private reads. Seed one attempt of each result type. Run:

```bash
npm --prefix functions test
npm run test:rules
npm test
npm run lint
```

Expected: all Functions/root tests pass; Rules tests pass when Java emulator is available. If Java is absent, record the exact blocker and do not claim Rules verification.

- [ ] **Step 6: Commit**

```bash
git add functions firestore.rules test/firestore.rules.test.mjs test/quiz-registry.test.mjs
git commit -m "Generalize trusted services for three quizzes"
```

---

### Task 4: Build the Quiz Catalog, Student Gate, and Offline Sync Client

**Files:**
- Create: `src/QuizCatalog.jsx`
- Create: `src/StudentQuizShell.jsx`
- Create: `src/studentFunctions.js`
- Create: `src/studentSyncDomain.js`
- Create: `src/SyncStatus.jsx`
- Create: `src/ProgressConflictDialog.jsx`
- Modify: `src/firebase.js`
- Modify: `src/main.jsx`
- Modify: `quiz.html`
- Create: `test/quiz-catalog.test.mjs`
- Create: `test/student-sync-domain.test.mjs`
- Modify: `test/pages-deployment.test.mjs`

**Interfaces:**
- Produces `resolveQuizRoute(search)` returning catalog, valid quiz, or not-found.
- Produces `createLocalProgressStore(storage)` and `resolveProgressConflict({ local, cloud })`.
- Produces callable wrappers `loadStudentProgress`, `saveStudentProgress`, `submitQuizAttempt` in `asia-east1`.
- `StudentQuizShell` passes validated identity/progress/sync callbacks to the selected quiz module.

- [ ] **Step 1: Write failing catalog, routing, and local-isolation tests**

```js
test("catalog routes only the three registered IDs", () => {
  assert.equal(resolveQuizRoute("").mode, "catalog");
  assert.equal(resolveQuizRoute("?quiz=english-review-2").quizId, "english-review-2");
  assert.equal(resolveQuizRoute("?quiz=unknown").mode, "not-found");
});

test("local keys isolate student and quiz", () => {
  assert.equal(progressStorageKey("student-1", "english-review-2"), "jhst:progress:student-1:english-review-2");
  assert.notEqual(progressStorageKey("student-1", "english-review-2"), progressStorageKey("student-1", "periodic-table"));
});
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `node --test test/quiz-catalog.test.mjs test/student-sync-domain.test.mjs`

Expected: FAIL because the catalog/sync modules do not exist.

- [ ] **Step 3: Implement catalog and exact student validation gate**

Catalog renders three full-width rows with subject, title, description, and stable URL. Selected quiz shows name/code form before importing its module. Unknown IDs show `找不到這份試卷` plus return links. Never cache raw name/code in persistent localStorage.

- [ ] **Step 4: Implement local-first coalesced sync and conflict choice**

Local snapshots use `jhst:progress:<studentId>:<quizId>` and pending submissions use `jhst:pending-attempt:<studentId>:<quizId>`. Save locally before debounced cloud writes; retain pending data until server acknowledgement. A newer unsynced local snapshot versus cloud returns `choice`, never silently overwrites. Distinguish missing config, bad identity, inactive student, offline pending, permission denied, and version mismatch.

- [ ] **Step 5: Run focused and build verification**

Run: `node --test test/quiz-catalog.test.mjs test/student-sync-domain.test.mjs test/pages-deployment.test.mjs`

Run: `npm run build`

Run: `npm run lint`

Expected: PASS; `dist/quiz.html` contains the catalog entry without unresolved Functions imports.

- [ ] **Step 6: Commit**

```bash
git add src/QuizCatalog.jsx src/StudentQuizShell.jsx src/studentFunctions.js src/studentSyncDomain.js src/SyncStatus.jsx src/ProgressConflictDialog.jsx src/firebase.js src/main.jsx quiz.html test/quiz-catalog.test.mjs test/student-sync-domain.test.mjs test/pages-deployment.test.mjs
git commit -m "Add shared quiz catalog and student sync shell"
```

---

### Task 5: Adapt the Biology Quiz to the Shared Shell

**Files:**
- Rename: `src/App.jsx` to `src/BiologyQuiz.jsx`
- Modify: `src/quizRandomization.js`
- Modify: `src/quizAttemptLifecycle.js`
- Create: `src/biologyQuizAdapter.js`
- Modify: `src/main.jsx`
- Modify: `test/quiz-attempt-lifecycle.test.mjs`
- Create: `test/biology-quiz-adapter.test.mjs`

**Interfaces:**
- Produces biology adapter methods `createAttempt`, `restoreAttempt`, `serializeProgress`, `buildSubmission`, `renderResult`.
- Consumes validated identity/progress and sync callbacks from `StudentQuizShell`.

- [ ] **Step 1: Write failing adapter restore/submission tests**

```js
test("biology restores exact shuffled question and option order", () => {
  const restored = biologyQuizAdapter.restoreAttempt(SAVED_BIOLOGY_ATTEMPT);
  assert.deepEqual(restored.questionOrder, SAVED_BIOLOGY_ATTEMPT.questionOrder);
  assert.deepEqual(restored.optionOrder, SAVED_BIOLOGY_ATTEMPT.optionOrder);
});
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `node --test test/biology-quiz-adapter.test.mjs test/quiz-attempt-lifecycle.test.mjs`

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Move identity/sync responsibilities out of the biology renderer**

Keep current visual design, one-question navigation, shuffle, wrong-answer review, and Ebbinghaus schedule. Remove direct Firebase calls, duplicate identity state, and old UID-path progress. All answer changes serialize through the shell; server-confirmed result controls `紀錄已保存`.

- [ ] **Step 4: Verify results, retry, and reset isolation**

Retry creates a new attempt/order; reset clears only biology active progress, not history or other quiz keys. A failed submit retains pending biology data and shows retry.

Run: `node --test test/biology-quiz-adapter.test.mjs test/quiz-attempt-lifecycle.test.mjs test/quiz-randomization.test.mjs`

Run: `npm test && npm run lint && npm run build`

- [ ] **Step 5: Commit**

```bash
git add src/BiologyQuiz.jsx src/biologyQuizAdapter.js src/quizRandomization.js src/quizAttemptLifecycle.js src/main.jsx test/biology-quiz-adapter.test.mjs test/quiz-attempt-lifecycle.test.mjs
git commit -m "Adapt biology quiz to shared sync shell"
```

---

### Task 6: Build the Preserved English Full-Page Experience

**Files:**
- Create: `src/EnglishReview2Quiz.jsx`
- Create: `src/englishReview2Adapter.js`
- Create: `test/english-review-2-adapter.test.mjs`
- Modify: `src/main.jsx`

**Interfaces:**
- Produces English adapter with the five shared shell methods.
- Uses `ENGLISH_REVIEW_2` and `EnglishQuestionFigure` from Task 1.

- [ ] **Step 1: Write failing progress and unanswered-confirmation tests**

```js
test("English progress preserves answers and last answered question", () => {
  const saved = englishReview2Adapter.serializeProgress({ answers: { e01: "e01-o3" }, lastAnsweredId: "e01" });
  assert.deepEqual(saved.answers, { e01: "e01-o3" });
  assert.equal(saved.lastAnsweredId, "e01");
});

test("submission reports the exact unanswered count before confirmation", () => {
  assert.equal(englishReview2Adapter.getUnansweredCount({ e01: "e01-o3" }), 39);
});
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `node --test test/english-review-2-adapter.test.mjs`

Expected: FAIL because the adapter/UI do not exist.

- [ ] **Step 3: Implement the original full-page layout as React**

Render sticky timer/score area, two section headers, reading blocks in source positions, 40 cards, controlled Q36 SVG, responsive option grid, and one submit button. Preserve original question order and explanations. Before submission, if any answer is missing, show `尚有 N 題未作答，未作答將計為錯誤，仍要交卷嗎？`.

- [ ] **Step 4: Render only server-confirmed scoring**

After successful submission, mark correct/incorrect choices and show explanations using the trusted result/wrong IDs. Never display caller-calculated total as saved. Cross-device restore scrolls to `lastAnsweredId` only after the student chooses cloud/local progress.

Run: `node --test test/english-review-2-definition.test.mjs test/english-review-2-adapter.test.mjs`

Run: `npm test && npm run lint && npm run build`

- [ ] **Step 5: Commit**

```bash
git add src/EnglishReview2Quiz.jsx src/englishReview2Adapter.js src/main.jsx test/english-review-2-adapter.test.mjs
git commit -m "Add synced English Review 2 experience"
```

---

### Task 7: Build the Preserved Periodic-Table Experience

**Files:**
- Create: `src/PeriodicTableQuiz.jsx`
- Create: `src/periodicTableAdapter.js`
- Create: `test/periodic-table-adapter.test.mjs`
- Modify: `src/main.jsx`

**Interfaces:**
- Produces periodic adapter with the five shared shell methods.
- Uses Task 2 definition and pure state transitions.

- [ ] **Step 1: Write failing restore/timer/result tests**

```js
test("periodic restore keeps pool order, placed IDs, errors, and paused elapsed time", () => {
  const restored = periodicTableAdapter.restoreAttempt(SAVED_PERIODIC_ATTEMPT, 500000);
  assert.deepEqual(restored.poolOrder, SAVED_PERIODIC_ATTEMPT.poolOrder);
  assert.equal(restored.errorCount, SAVED_PERIODIC_ATTEMPT.errorCount);
  assert.equal(restored.elapsedMs, SAVED_PERIODIC_ATTEMPT.elapsedMs);
  assert.equal(restored.timerState, "paused");
});
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `node --test test/periodic-table-adapter.test.mjs test/periodic-table-definition.test.mjs`

Expected: FAIL because the adapter/UI do not exist.

- [ ] **Step 3: Implement responsive grid, pool, and two input modes**

Desktop tiles support drag/drop; every tile and target also supports click-select/click-place for touch and keyboard. Wrong targets increment errors and keep the tile. Correct targets lock the tile. Buttons preserve Start, Pause/Resume, End, Reset, and Check; End before 118 only saves progress.

- [ ] **Step 4: Implement timer/sync semantics and completion**

Persist accumulated elapsed time, never count offline time, and resume running only after restore. Full 118 completion submits one placement result; UI displays server-confirmed `完成 118／118` plus informational errors and duration. Reset requires confirmation and affects only periodic active progress.

Run: `node --test test/periodic-table-definition.test.mjs test/periodic-table-adapter.test.mjs`

Run: `npm test && npm run lint && npm run build`

- [ ] **Step 5: Commit**

```bash
git add src/PeriodicTableQuiz.jsx src/periodicTableAdapter.js src/main.jsx test/periodic-table-adapter.test.mjs
git commit -m "Add synced periodic table experience"
```

---

### Task 8: Generalize Records, Masked IP, and Safe Student Removal

**Files:**
- Create: `src/attemptResultDomain.js`
- Create: `src/attemptPrivateDomain.js`
- Create: `src/SafeStudentRemovalDialog.jsx`
- Create: `src/safeStudentRemovalDomain.js`
- Create: `functions/adminStudentService.js`
- Modify: `functions/firestoreStudentRepository.js`
- Modify: `functions/index.js`
- Modify: `src/teacherFirebase.js`
- Modify: `src/TeacherApp.jsx`
- Create: `functions/test/admin-student-service.test.mjs`
- Create: `test/attempt-result-domain.test.mjs`
- Create: `test/safe-student-removal-domain.test.mjs`

**Interfaces:**
- Produces `formatAttemptResult(attempt)` for score and placement results, including legacy attempts.
- Produces admin callable `removeOrDeactivateStudent({ studentId })` returning `deleted|deactivated`.

- [ ] **Step 1: Write failing result-display tests**

```js
assert.equal(formatAttemptResult({ resultType: "score", score: 85, correctCount: 34, wrongCount: 6 }), "85 分｜答對 34｜答錯 6");
assert.equal(formatAttemptResult({ resultType: "placement", completedCount: 118, totalItems: 118, errorCount: 9, durationSeconds: 755 }), "完成 118／118｜錯誤 9 次｜12分35秒");
```

- [ ] **Step 2: Write failing safe-removal tests**

Any attempt matching `studentId`, regardless of quiz/result type, must deactivate and preserve all attempts/private records/review state while clearing active attempts. No attempts must remove student, exact entry, progress, admin link, and parent access, without changing counters.

- [ ] **Step 3: Implement admin-only private metadata and records UI**

Add subject column and quiz-aware result display. Search includes name, code, subject, and title. Load/join `attemptPrivate` only in admin mode; teachers/parents never request it. Legacy biology attempts render from old score fields.

- [ ] **Step 4: Implement verified-admin removal callable and confirmation UI**

Only verified Google admin passes. Student cards show `刪除／停用`; confirmation names student/code and states attempts cause deactivation. Failure leaves data visible and reports unconfirmed change.

- [ ] **Step 5: Run all focused suites**

Run: `npm --prefix functions test`

Run: `node --test test/attempt-result-domain.test.mjs test/safe-student-removal-domain.test.mjs test/admin-mode-domain.test.mjs`

Run: `npm run test:rules`

Expected: PASS where Java is available; never claim skipped Rules as passing.

- [ ] **Step 6: Commit**

```bash
git add functions src/teacherFirebase.js src/TeacherApp.jsx src/attemptResultDomain.js src/attemptPrivateDomain.js src/SafeStudentRemovalDialog.jsx src/safeStudentRemovalDomain.js functions/test/admin-student-service.test.mjs test/attempt-result-domain.test.mjs test/safe-student-removal-domain.test.mjs
git commit -m "Generalize records and safe student removal"
```

---

### Task 9: CI, Emulator Integration, Documentation, and Deployment Gate

**Files:**
- Create: `functions/test/emulator-integration.test.mjs`
- Modify: `.github/workflows/deploy-pages.yml`
- Modify: `firebase.json`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `.env.example`
- Modify: `test/pages-deployment.test.mjs`

**Interfaces:**
- Produces root scripts `test:functions`, `test:emulators`, `verify`.
- CI installs/tests root and Functions packages and runs emulators; Pages deployment remains automatic, Functions/Rules deployment remains an explicit manual gate.

- [ ] **Step 1: Add failing CI contract tests**

Assert workflow contains `npm --prefix functions ci`, Functions tests, combined emulator tests, and no automatic `firebase deploy --only functions`.

- [ ] **Step 2: Configure combined local verification**

Add Auth `9099`, Firestore `8080`, Functions `5001`, and scripts:

```json
{
  "test:functions": "npm --prefix functions test",
  "test:emulators": "firebase emulators:exec --only auth,firestore,functions \"node --test functions/test/emulator-integration.test.mjs test/firestore.rules.test.mjs\"",
  "verify": "npm test && npm run test:functions && npm run test:emulators && npm run lint && npm run build"
}
```

- [ ] **Step 3: Add emulator integration for all three quizzes**

Seed approved students; authenticate anonymously; save/resume each quiz from a second anonymous user; submit/retry; verify exactly one public/private pair per attempt; verify cross-kind payload rejection; verify teacher/parent cannot read IP; verify no-attempt deletion and any-quiz deactivation.

- [ ] **Step 4: Update operator/privacy documentation**

Document three routes, result shapes, informational periodic metrics, local setup, Functions region/maxInstances, masked-IP privacy, safe deletion, no service-account keys, Billing prerequisite, and budget alerts not being hard caps.

- [ ] **Step 5: Run complete local verification**

Run:

```bash
npm ci --cache /private/tmp/jhst-npm-cache
npm --prefix functions ci --cache /private/tmp/jhst-npm-cache
npm run verify
git diff --check
```

Expected: all unit/emulator tests pass, lint 0, build success, no production changes. If Java is unavailable, install/use a temporary JDK in a task-specific temp directory or run the same checks in GitHub Actions; do not waive the emulator gate.

- [ ] **Step 6: Inspect production prerequisites read-only**

Verify project `junior-high-school-test`, current Functions, Firestore location, Billing state, and whether `asia-east1` is compatible. If not, revise Functions and client region together and rerun verification.

- [ ] **Step 7: Commit and request exact deployment approval**

```bash
git add functions/test/emulator-integration.test.mjs .github/workflows/deploy-pages.yml firebase.json package.json README.md .env.example test/pages-deployment.test.mjs
git commit -m "Verify three-quiz deployment workflow"
```

Present four callable names, verified region, `maxInstances: 3`, Rules changes, Billing status, and suggested low budget alert. Do not deploy until the user explicitly approves.

- [ ] **Step 8: After approval, deploy and perform public E2E**

Deploy Functions/Rules, push the reviewed branch, wait for Pages, then verify each quiz with disposable students: start, partial save, second-browser restore, completion, role-scoped records, admin masked IP, idempotent retry, no-attempt deletion, and attempted-student deactivation. Confirm no full IP in Firestore or inspected application logs.
