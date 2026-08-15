# Biology Result Normalization Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a server-confirmed Biology result safely reusable by review scheduling, show an accurate post-confirmation error message, and redeploy the corrected frontend without duplicating the existing production attempt.

**Architecture:** Keep `biologyQuizAdapter.renderResult()` as the single validation and normalization boundary, but make its normalized output idempotent by preserving `resultType: "score"`. Track whether `sync.submit()` resolved inside `BiologyQuiz.finishQuiz()` so failures after server confirmation use a distinct saved-record message. The backend contract, attempt identity, Functions, Rules, and indexes remain unchanged.

**Tech Stack:** React, JavaScript ES modules, Node test runner, Vite, GitHub Actions Pages deployment, Firebase callable Functions.

## Global Constraints

- Follow strict red-green TDD: each production change requires a failing regression test first.
- Do not weaken Biology result validation or expose answer keys in the browser bundle.
- Preserve the existing exact attempt identity and idempotent retry behavior.
- Do not modify or redeploy Firebase Functions, Firestore Rules, or Firestore indexes.
- Do not add dependencies or perform unrelated refactoring.
- The existing production attempt for `20260815-001` must be reused during the final smoke test; do not create another student.

---

### Task 1: Make normalized Biology results idempotent

**Files:**
- Modify: `test/biology-quiz-adapter.test.mjs`
- Modify: `src/biologyQuizAdapter.js:150-173`

**Interfaces:**
- Consumes: `biologyQuizAdapter.renderResult(result)` and `biologyQuizAdapter.updateReviewProgress({ previous, result, today })`.
- Produces: a normalized Biology score result shaped as `{ resultType: "score", score, correctCount, wrongCount, review }` that remains valid when passed through the adapter again.

- [ ] **Step 1: Write the failing idempotence regression test**

Extend `test("biology uses only the server-confirmed score result", ...)` with a literal raw result and assert both normalization and review scheduling:

```js
const rawResult = {
  resultType: "score",
  score: 95,
  correctCount: 19,
  wrongCount: 1,
  review: [{ questionId: "q1", correctOptionId: "q1-o3" }],
  ignored: "server transport detail",
};
const normalized = biologyQuizAdapter.renderResult(rawResult);

assert.deepEqual(normalized, {
  resultType: "score",
  score: 95,
  correctCount: 19,
  wrongCount: 1,
  review: [{ questionId: "q1", correctOptionId: "q1-o3" }],
});
assert.equal(
  biologyQuizAdapter.updateReviewProgress({
    previous: {},
    result: normalized,
    today: new Date(2026, 7, 15),
  }).q1.lastResult,
  "wrong",
);
```

This test catches the production regression where `renderResult()` drops `resultType`, causing the second validation in `updateReviewProgress()` to fail.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test test/biology-quiz-adapter.test.mjs
```

Expected: FAIL because the normalized object lacks `resultType`, or because `updateReviewProgress()` throws `invalid-biology-result`.

- [ ] **Step 3: Implement the minimal adapter fix**

Change only the normalized return object in `src/biologyQuizAdapter.js`:

```js
return {
  resultType: "score",
  score: result.score,
  correctCount: result.correctCount,
  wrongCount: result.wrongCount,
  review: result.review.map((item) => ({ ...item })),
};
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
node --test test/biology-quiz-adapter.test.mjs
```

Expected: all Biology adapter tests PASS with zero failures.

- [ ] **Step 5: Commit the adapter fix**

```bash
git add test/biology-quiz-adapter.test.mjs src/biologyQuizAdapter.js
git commit -m "Fix Biology result normalization"
```

---

### Task 2: Distinguish post-confirmation UI failures

**Files:**
- Create: `src/biologySubmissionStatus.js`
- Create: `test/biology-submission-status.test.mjs`
- Modify: `src/BiologyQuiz.jsx:138-171`

**Interfaces:**
- Produces: `biologySubmissionFailureMessage({ confirmed: boolean }): string`.
- Consumes: a local `submissionConfirmed` boolean that becomes `true` immediately after `await sync.submit(...)` resolves.

- [ ] **Step 1: Write the failing message regression test**

Create `test/biology-submission-status.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { biologySubmissionFailureMessage } from "../src/biologySubmissionStatus.js";

test("biology distinguishes a failed submit from a confirmed result-display failure", () => {
  assert.equal(
    biologySubmissionFailureMessage({ confirmed: false }),
    "作答紀錄尚未送出，資料已保留；請檢查網路後重試。",
  );
  assert.equal(
    biologySubmissionFailureMessage({ confirmed: true }),
    "完成紀錄已保存；結果顯示失敗，請重新整理頁面。",
  );
});
```

This test catches any change that again tells users a server-confirmed attempt was not submitted.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test test/biology-submission-status.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` because the production status module does not exist.

- [ ] **Step 3: Add the minimal status boundary**

Create `src/biologySubmissionStatus.js`:

```js
export function biologySubmissionFailureMessage({ confirmed }) {
  return confirmed
    ? "完成紀錄已保存；結果顯示失敗，請重新整理頁面。"
    : "作答紀錄尚未送出，資料已保留；請檢查網路後重試。";
}
```

In `src/BiologyQuiz.jsx`, import the helper, initialize `let submissionConfirmed = false` before the `try`, assign the raw server result after `await sync.submit(...)`, set `submissionConfirmed = true`, and only then normalize it:

```js
let submissionConfirmed = false;
try {
  // existing snapshot, save, and flush steps
  const serverResult = await sync.submit(
    biologyQuizAdapter.buildSubmission({ ...attemptSnapshot, reviewProgress }),
  );
  submissionConfirmed = true;
  const result = biologyQuizAdapter.renderResult(serverResult);
  // existing review and result state updates
} catch (error) {
  console.error("Biology submission failed", error);
  setSaveError(biologySubmissionFailureMessage({ confirmed: submissionConfirmed }));
}
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
node --test test/biology-submission-status.test.mjs test/biology-quiz-adapter.test.mjs
```

Expected: both suites PASS with zero failures.

- [ ] **Step 5: Commit the status fix**

```bash
git add src/biologySubmissionStatus.js src/BiologyQuiz.jsx test/biology-submission-status.test.mjs
git commit -m "Clarify confirmed Biology submission failures"
```

---

### Task 3: Verify, publish, and smoke-test the fix

**Files:**
- Verify only: all project and Functions sources
- Publish: branch `fix/biology-result-normalization` to GitHub

**Interfaces:**
- Consumes: the two commits from Tasks 1 and 2.
- Produces: a merged GitHub Pages frontend that safely displays the already-stored production Biology result.

- [ ] **Step 1: Run complete local verification**

Run:

```bash
npm run verify
git diff --check
```

Expected: root tests, Functions tests, combined emulator gate, lint, and Vite build all exit 0. Emulator-only tests may skip only in the plain unit phases; the combined emulator gate must report zero skipped tests.

- [ ] **Step 2: Review the final diff and security boundary**

Run:

```bash
git diff --stat origin/main...HEAD
git diff origin/main...HEAD -- src/biologyQuizAdapter.js src/BiologyQuiz.jsx src/biologySubmissionStatus.js test/biology-quiz-adapter.test.mjs test/biology-submission-status.test.mjs
npm run build
```

Expected: no server definition or answer-key import appears in `src`; the production build succeeds.

- [ ] **Step 3: Push and create a draft PR**

```bash
git push -u origin fix/biology-result-normalization
gh pr create --draft --base main --head fix/biology-result-normalization --title "Fix Biology result display after submission" --body "Fix the production Biology result normalization failure after a confirmed submission. Preserve the score discriminator across repeated validation, distinguish pre-submit failures from post-confirmation display failures, and add red-green regression coverage. Full verification and production build pass. Firebase Functions, Firestore Rules, indexes, and answer-key boundaries are unchanged."
```

The PR body must state the production symptom, root cause, TDD evidence, validation results, and that Firebase backend resources are unchanged.

- [ ] **Step 4: Mark ready and merge after a clean PR check**

```bash
gh pr ready fix/biology-result-normalization
gh pr merge fix/biology-result-normalization --merge
```

Expected: PR state is `MERGED` and the merge target is `main`.

- [ ] **Step 5: Wait for GitHub Pages deployment**

```bash
gh run list --repo AlexLiu1975/junior-high-school-test --branch main --limit 3
pages_run_id="$(gh run list --repo AlexLiu1975/junior-high-school-test --branch main --workflow deploy-pages.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
gh run watch "$pages_run_id" --repo AlexLiu1975/junior-high-school-test --exit-status
```

Expected: `Deploy to GitHub Pages` completes successfully for the merge commit.

- [ ] **Step 6: Reuse the existing production attempt for a live smoke test**

Open the Biology quiz for student code `20260815-001` and name `系統測試 20260815`. Load the preserved progress and submit the same attempt again through the normal UI.

Expected:

- the idempotent retry renders the results page;
- the score and wrong-answer review are visible;
- the page no longer shows `invalid-biology-result` or the unsent-record message;
- the teacher page still shows one attempt for this test run, not a duplicate.

- [ ] **Step 7: Report exact deployment and residual test data**

Report the PR URL, merge commit, Pages run URL, focused and full verification counts, live score, and whether the teacher record count remained one. State that `系統測試 20260815` is intentionally retained as an inactive-or-active test student until the owner chooses to deactivate it.
