# Biology Full Result Explanations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a secure, server-confirmed 20-question score and explanation review immediately after submitting **第1回　第1、2單元｜細胞與顯微鏡**.

**Architecture:** Publish Biology version 2 with corrected question 14 and 20 server-only explanations while retaining version 1 for exact legacy retries. Functions returns a response-only full review; the browser validates it, joins it to the immutable randomized attempt, and renders 20 cards without persisting or preloading answers.

**Tech Stack:** React 19, JavaScript ES modules, Firebase callable Functions, Firestore transactions, Node test runner, Firebase Emulator Suite, Vite, GitHub Actions Pages.

## Global Constraints

- Show all 20 questions only after successful submission, including correctness, student answer, correct answer, and Traditional-Chinese explanation.
- Keep explanations and answer keys out of `src`, progress, pending submissions, Firestore attempt documents, and initial browser chunks.
- Preserve randomized question/option order and exact idempotent retry identity.
- Publish Biology version 2; retain version 1 server-side so old retries are not reinterpreted with the corrected answer key.
- Version-2 results require 20 unique review items; version-1 retries may return trusted score-only output without invented explanations.
- Keep Ebbinghaus scheduling, retry, clear-progress, identity, and teacher record behavior.
- Do not change Firestore Rules, indexes, Billing, dependencies, English review, or Periodic Table behavior.
- Use strict red-green TDD for every production change.
- Obtain explicit user approval immediately before Functions deployment or Pages merge.

---

### Task 1: Add explicit Biology version compatibility

**Files:**
- Modify: `functions/shared/biologyDefinition.js`
- Modify: `functions/shared/quizRegistry.js`
- Modify: `test/quiz-registry.test.mjs`
- Modify: `test/answer-key-boundary.test.mjs`

**Interfaces:**
- Produces: current `QUIZ_DEFINITION` version 2 and `LEGACY_BIOLOGY_DEFINITIONS` containing version 1.
- Produces: `getQuizDefinition("biology-cell-microscope-1", 1|2)`; `QUIZ_CATALOG` exposes only version 2.
- Produces server-only `resultReviewScope`: version 1 `"legacy-score"`, version 2 `"all"`.

- [ ] **Step 1: Write the failing registry tests**

```js
const current = getQuizDefinition("biology-cell-microscope-1", 2);
const legacy = getQuizDefinition("biology-cell-microscope-1", 1);
assert.equal(QUIZ_CATALOG.filter(({ id }) => id === current.id).length, 1);
assert.equal(QUIZ_CATALOG.find(({ id }) => id === current.id).version, 2);
assert.equal(current.resultReviewScope, "all");
assert.equal(legacy.resultReviewScope, "legacy-score");
assert.equal(legacy.questions[13].options[0].text, "最大的放大倍率：甲＜乙");
assert.equal(legacy.questions[13].options[2].correct, true);
```

Update the parity test's strip function to remove `resultReviewScope` as server-only metadata.

- [ ] **Step 2: Verify RED**

Run `node --test test/quiz-registry.test.mjs test/answer-key-boundary.test.mjs`.

Expected: FAIL because version 2 and a legacy definition map do not exist.

- [ ] **Step 3: Implement the version boundary**

Retain the current raw questions as version 1 and derive version 2 separately. Export:

```js
export const LEGACY_BIOLOGY_DEFINITIONS = [buildDefinition({
  version: 1,
  resultReviewScope: "legacy-score",
  questions: RAW_QUESTIONS_V1,
})];
export const QUIZ_DEFINITION = buildDefinition({
  version: 2,
  resultReviewScope: "all",
  questions: RAW_QUESTIONS_V2,
});
```

In `quizRegistry.js`, keep a current-definition list for `QUIZ_CATALOG`, but build `QUIZ_BY_ID` from current definitions plus legacy Biology definitions. Throw during construction on duplicate `(id, version)` pairs.

- [ ] **Step 4: Verify GREEN**

Run `node --test test/quiz-registry.test.mjs test/answer-key-boundary.test.mjs`.

Expected: all focused tests PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/shared/biologyDefinition.js functions/shared/quizRegistry.js test/quiz-registry.test.mjs test/answer-key-boundary.test.mjs
git commit -m "Version the corrected Biology quiz"
```

---

### Task 2: Correct question 14 and add 20 explanations

**Files:**
- Modify: `functions/shared/biologyDefinition.js`
- Modify: `src/biologyQuizContent.js`
- Create: `test/biology-definition.test.mjs`
- Modify: `test/answer-key-boundary.test.mjs`

**Interfaces:**
- Produces: version-2 questions with exactly one correct option and one non-empty `explanation` each.
- Produces: client-safe version-2 content without `correct`, `correctIndex`, `explanation`, or `resultReviewScope`.

- [ ] **Step 1: Write failing content-quality tests**

```js
assert.equal(QUIZ_DEFINITION.version, 2);
assert.equal(QUIZ_DEFINITION.questions.length, 20);
for (const question of QUIZ_DEFINITION.questions) {
  assert.equal(question.options.filter(({ correct }) => correct).length, 1);
  assert.equal(typeof question.explanation, "string");
  assert.ok(question.explanation.trim().length >= 20);
}
assert.equal(QUIZ_DEFINITION.questions[13].options[1].correct, true);
assert.match(QUIZ_DEFINITION.questions[13].explanation, /解剖顯微鏡.*立體/);
```

Add `虎克觀察的是軟木栓中已死亡細胞留下的細胞壁格室` to the production-bundle marker denylist.

- [ ] **Step 2: Verify RED**

Run `node --test test/biology-definition.test.mjs test/answer-key-boundary.test.mjs`.

Expected: FAIL because the corrected version-2 content and explanations are absent.

- [ ] **Step 3: Add the exact explanation content**

```js
const EXPLANATIONS_V2 = {
  q1: "虎克觀察的是軟木栓中已死亡細胞留下的細胞壁格室，不是細胞膜；他因此首先描述並命名了細胞。",
  q2: "人工淚液需接近人體淚液的滲透壓，成分與約 0.9% 的生理食鹽水相近，較不會使眼睛細胞因滲透作用而受刺激。",
  q3: "二氧化碳是小分子，可直接穿過細胞膜並由高濃度處向低濃度處擴散；葡萄糖與離子通常需要膜蛋白協助。",
  q4: "人類屬於動物，動物細胞沒有葉綠體；榕樹、大王椰子與高麗菜都是植物，綠色部位的細胞具有葉綠體。",
  q5: "植物細胞外有堅硬的細胞壁，可抵抗吸水後產生的膨壓，因此放入清水時通常只會膨脹而不易破裂。",
  q6: "葡萄糖是細胞呼吸可直接利用的重要養分，能較快提供細胞產生能量所需的原料，因此可協助緩解低血糖不適。",
  q7: "細胞呼吸會消耗氧氣並產生二氧化碳，所以氧氣由細胞外擴散進入，二氧化碳則由細胞內擴散到外界。依題圖方向分別為丙與甲。",
  q8: "細胞是生物體構造與功能的基本單位；分子、原子和葡萄糖雖可構成細胞，卻不能獨立代表生物體的基本生命單位。",
  q9: "粒線體是細胞進行細胞呼吸、利用葡萄糖等養分釋放能量的主要場所，因此常被稱為細胞的發電廠。",
  q10: "水蘊草與軟木栓都屬植物組織，細胞外層具有細胞壁，能支持並維持較規則、不易變形的外形。",
  q11: "更換複式顯微鏡的物鏡應轉動旋轉盤；放大倍率是目鏡倍率乘以物鏡倍率，光線則先經物鏡再到目鏡。",
  q12: "尋找會移動的水中小生物時應先用低倍鏡，因為低倍視野較大；直接換成高倍鏡會使視野縮小，反而更難找回目標。",
  q13: "放上玻片後先在側面觀察，利用粗調節輪讓低倍物鏡靠近標本，再從目鏡觀察並慢慢拉遠對焦，可避免物鏡撞破玻片。",
  q14: "解剖顯微鏡的放大倍率通常較低，但影像方向與實物相同且較有立體感，適合觀察昆蟲等較大的立體物，因此 B 正確。",
  q15: "寬尾鳳蝶的管狀口器體積較大且具有立體構造，適合用解剖顯微鏡觀察；病毒與細胞內細微構造需要更高解析能力。",
  q16: "顯微鏡倍率愈高，進入視野的光量通常愈少，視野也愈暗；細胞看起來最大、數目最少的 C 代表最高倍率。",
  q17: "高倍觀察時只使用粗調節輪可能讓物鏡撞到玻片，也不易精確對焦；通常低倍先粗調，高倍改用細調節輪。",
  q18: "總放大倍率等於目鏡倍率乘以物鏡倍率。九種搭配中 5×20 與 10×10 都是 100 倍，因此不同的總倍率共有八種。",
  q19: "低倍鏡的放大倍率較小，因此能看到的範圍較大；光圈主要影響亮度，不會直接決定視野範圍大小。",
  q20: "解剖顯微鏡下影像方向與實物相同，要讓蜜蜂移到視野中央，應直接朝需要的方向移動標本，而不是調焦或改變亮度。",
};
```

For q14, change A to `最大的放大倍率：甲＞乙`, keep B as `甲看到的影像較為立體`, and mark only B correct. Update `src/biologyQuizContent.js` mechanically from the stripped version-2 definition.

- [ ] **Step 4: Verify GREEN and answer isolation**

Run `node --test test/biology-definition.test.mjs test/quiz-registry.test.mjs test/answer-key-boundary.test.mjs`.

Expected: PASS; fresh production chunks contain no explanation marker.

- [ ] **Step 5: Commit**

```bash
git add functions/shared/biologyDefinition.js src/biologyQuizContent.js test/biology-definition.test.mjs test/answer-key-boundary.test.mjs
git commit -m "Add trusted Biology explanations"
```

---

### Task 3: Return full review without persistence

**Files:**
- Modify: `functions/shared/reviewPayload.js`
- Modify: `functions/studentService.js`
- Modify: `functions/test/student-service.test.mjs`
- Modify: `functions/test/emulator-integration.test.mjs`

**Interfaces:**
- Produces: `buildResultReview(definition, result)`.
- Biology v2: `{ reviewAvailable: true, review: ReviewItem[20] }`.
- Biology v1: `{ reviewAvailable: false }`.
- English: retains wrong-question-only review.

- [ ] **Step 1: Write failing direct/retry tests**

```js
const result = await submitAttempt(version2BiologyInput);
assert.equal(result.reviewAvailable, true);
assert.equal(result.review.length, 20);
assert.deepEqual(result.review.map(({ questionId }) => questionId),
  QUIZ_DEFINITION.questions.map(({ id }) => id));
for (const item of result.review) {
  assert.deepEqual(Object.keys(item).sort(), ["correctOptionId", "explanation", "questionId"]);
}
assert.equal(Object.hasOwn(repository.attempts.get(result.attemptId), "review"), false);
assert.equal(Object.hasOwn(repository.attempts.get(result.attemptId), "explanation"), false);
assert.deepEqual(await retrySameAttempt(), result);
assert.equal(repository.attempts.size, 1);
assert.equal(repository.privateAttempts.size, 1);
```

Add a v1 stored retry expecting `reviewAvailable: false` and no `review`. Extend the combined emulator Biology case to assert 20 review items, retry equality, and one public/private pair.

- [ ] **Step 2: Verify RED**

Run `npm --prefix functions test -- --test-name-pattern="Biology|review|retry"`.

Expected: FAIL because Biology currently returns wrong-question review only.

- [ ] **Step 3: Implement the response policy**

```js
export function buildResultReview(definition, result) {
  if (definition?.kind !== "multiple-choice" || result?.resultType !== "score") {
    throw new Error("invalid-trusted-result");
  }
  if (definition.resultReviewScope === "legacy-score") {
    return { reviewAvailable: false };
  }
  const ids = definition.resultReviewScope === "all"
    ? definition.questions.map(({ id }) => id)
    : result.wrongIds;
  return { reviewAvailable: true, review: buildReviewPayload(definition, ids) };
}
```

Use it for both new submissions and stored retries. Persist only the existing score fields and `wrongIds`; never persist `review`, `reviewAvailable`, answers, or explanations.

- [ ] **Step 4: Verify GREEN**

Run `npm --prefix functions test` and `npm run test:emulators`.

Expected: all Functions tests PASS; combined emulator gate PASS with zero skips.

- [ ] **Step 5: Commit**

```bash
git add functions/shared/reviewPayload.js functions/studentService.js functions/test/student-service.test.mjs functions/test/emulator-integration.test.mjs
git commit -m "Return complete Biology review after submission"
```

---

### Task 4: Validate review and build 20 ordered rows

**Files:**
- Modify: `src/biologyQuizAdapter.js`
- Modify: `test/biology-quiz-adapter.test.mjs`

**Interfaces:**
- Produces normalized v2 result with `reviewAvailable: true` and 20 review items.
- Produces `buildAnswerReviewDisplay({ attempt, result })` returning 20 attempt-ordered rows.
- Accepts legacy `reviewAvailable: false` as score-only and returns no fabricated rows.

- [ ] **Step 1: Write failing adapter tests**

```js
const normalized = biologyQuizAdapter.renderResult(fullServerResult);
assert.equal(normalized.review.length, 20);
const rows = biologyQuizAdapter.buildAnswerReviewDisplay({ attempt, result: normalized });
assert.equal(rows.length, 20);
assert.deepEqual(rows.map(({ id }) => id), attempt.questions.map(({ id }) => id));
assert.equal(rows[0].selectedAnswer.letter, "B");
assert.equal(rows[0].isCorrect, false);
assert.equal(rows[1].selectedAnswer, null);
assert.match(rows[0].explanation, /\S/);
```

Reject 19 items, duplicate question IDs, cross-question correct option IDs, extra fields, and empty explanations. Verify legacy score-only normalization returns no rows.

- [ ] **Step 2: Verify RED**

Run `node --test test/biology-quiz-adapter.test.mjs`.

Expected: FAIL because the adapter expects wrong-question review.

- [ ] **Step 3: Implement strict full-review normalization**

Require the complete Biology question-ID set when `reviewAvailable === true`. Map `attempt.questions` to rows containing:

```js
{
  id, attemptPosition, text, isCorrect,
  selectedAnswer: null | { letter, text },
  correctAnswer: { letter, text },
  explanation,
}
```

Derive Ebbinghaus wrong IDs from rows where `isCorrect === false`; do not use the full review item count as the wrong count.

- [ ] **Step 4: Verify GREEN**

Run `node --test test/biology-quiz-adapter.test.mjs test/student-sync-domain.test.mjs`.

Expected: PASS with no retry/session regression.

- [ ] **Step 5: Commit**

```bash
git add src/biologyQuizAdapter.js test/biology-quiz-adapter.test.mjs
git commit -m "Validate complete Biology result review"
```

---

### Task 5: Render 20 result cards

**Files:**
- Modify: `src/BiologyQuiz.jsx`
- Create: `src/biologyResultPresentation.js`
- Create: `test/biology-result-presentation.test.mjs`
- Modify: `test/biology-submission-status.test.mjs`

**Interfaces:**
- Produces exact current, legacy, and confirmed-review-failure messages.
- Consumes `buildAnswerReviewDisplay({ attempt, result })`.

- [ ] **Step 1: Write failing presentation tests**

```js
assert.equal(biologyResultStatus({ reviewAvailable: true }), "成績與解析");
assert.equal(
  biologyResultStatus({ reviewAvailable: false }),
  "完成紀錄已保存；此筆舊成績沒有逐題解析，因此只顯示總成績。",
);
assert.equal(
  biologyConfirmedReviewFailureMessage(),
  "完成紀錄已保存，但解析暫時無法顯示，請重新整理頁面。",
);
```

- [ ] **Step 2: Verify RED**

Run `node --test test/biology-result-presentation.test.mjs test/biology-submission-status.test.mjs`.

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement result presentation**

Replace wrong-only cards with **成績與解析（20 題）** and one card per row:

```jsx
<p>{row.isCorrect ? "✓ 答對" : "✕ 答錯"}</p>
<p>{row.text}</p>
<p>你的答案：{row.selectedAnswer ? `(${row.selectedAnswer.letter}) ${row.selectedAnswer.text}` : "未作答"}</p>
<p>正確答案：({row.correctAnswer.letter}) {row.correctAnswer.text}</p>
<div>💡 <strong>解題觀念：</strong>{row.explanation}</div>
```

Use green for correct cards and red for incorrect/unanswered cards. Keep score, Ebbinghaus schedule, retry, and clear actions. Legacy score-only results show the exact legacy message and no cards. Post-confirmation malformed review shows the exact saved-record explanation error.

- [ ] **Step 4: Verify GREEN and build**

Run:

```bash
node --test test/biology-result-presentation.test.mjs test/biology-submission-status.test.mjs test/biology-quiz-adapter.test.mjs
npm run build
```

Expected: focused tests and build PASS.

- [ ] **Step 5: Commit**

```bash
git add src/BiologyQuiz.jsx src/biologyResultPresentation.js test/biology-result-presentation.test.mjs test/biology-submission-status.test.mjs
git commit -m "Show all Biology answers and explanations"
```

---

### Task 6: Verify, deploy, and smoke-test

**Files:**
- Verify: all root and Functions sources
- Publish: `feature/biology-full-result-explanations`

**Interfaces:**
- Consumes Tasks 1–5.
- Produces reviewed Functions and Pages releases with one verified live v2 attempt.

- [ ] **Step 1: Run complete verification**

Run `npm run verify` and `git diff --check origin/main...HEAD`.

Expected: root, Functions, combined emulator, lint, and build exit 0; combined emulator gate has zero skipped tests.

- [ ] **Step 2: Audit boundaries**

Inspect `git diff origin/main...HEAD`, run a fresh build, scan `dist` for explanation markers, and inspect write projections. Confirm no attempt/progress write has `review` or `explanation`, v1/v2 resolve separately, and English/Periodic behavior is unchanged.

- [ ] **Step 3: Request explicit deployment approval**

Report exact test evidence and ask permission to deploy Functions and merge Pages. Stop until approved.

- [ ] **Step 4: Deploy only the four existing Functions**

```bash
firebase use junior-high-school-test
firebase deploy --only functions:loadStudentProgress,functions:saveStudentProgress,functions:submitQuizAttempt,functions:removeOrDeactivateStudent
```

Do not deploy Rules or indexes. Confirm all four remain in `us-central1` with existing runtime/options.

- [ ] **Step 5: Publish and merge the frontend PR**

```bash
git push -u origin feature/biology-full-result-explanations
gh pr create --draft --base main --head feature/biology-full-result-explanations --title "Show complete Biology result explanations" --body "Show all 20 server-confirmed Biology answers and explanations after submission. Correct question 14 in version 2 while retaining version 1 for exact legacy retries. Keep explanations response-only and out of Firestore and browser bundles. Include RED/GREEN and full verification evidence plus the Functions deployment result before marking ready. Firestore Rules, indexes, and Billing remain unchanged."
gh pr ready feature/biology-full-result-explanations
gh pr merge feature/biology-full-result-explanations --merge
```

The reviewed PR body must include the q14 correction/version bump, server-only boundary, retry behavior, RED/GREEN and full-test evidence, Functions deployment, and unchanged Rules/indexes/Billing.

- [ ] **Step 6: Wait for Pages**

Use `gh run list` and `gh run watch` for `deploy-pages.yml` on `main`; require successful build and deploy for the merge SHA.

- [ ] **Step 7: Run one authorized live test**

Use an owner-approved test student for exactly one new v2 Biology attempt. Verify the score; 20 cards in randomized order; correct, incorrect, and unanswered states; non-empty explanations; corrected q14 answer B; no pre-submit explanation marker; teacher count increases by one; exact retry produces no duplicate.

- [ ] **Step 8: Report and retain test data safely**

Report commits, PR, merge SHA, Functions evidence, Pages run, exact test counts, live score, card count, and teacher record count. Identify the retained test student/attempt and do not delete or deactivate without approval.
