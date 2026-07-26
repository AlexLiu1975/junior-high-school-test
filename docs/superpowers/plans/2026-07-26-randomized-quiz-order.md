# Randomized Quiz Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Randomize all questions and each question's options for every new quiz attempt without breaking scoring, review history, or saved question IDs.

**Architecture:** Add a pure `quizRandomization` module that creates an immutable per-attempt quiz representation with option-level correctness markers. `App.jsx` stores that prepared quiz once when student verification succeeds, then uses it for navigation, scoring, and results until the attempt ends.

**Tech Stack:** React 19, JavaScript ES modules, Node test runner, Vite 8, oxlint

## Global Constraints

- Every new attempt randomizes both the 20-question order and each question's four options.
- One active attempt keeps a stable order while navigating backward and forward.
- The UI shows only the current attempt positions `1` through `20`; it never shows original question numbers.
- Stable source IDs `q1` through `q20` remain the keys for answers, progress, and review history.
- The original `QUESTIONS` array and its nested option arrays must never be mutated.
- No Firestore document shape, security rule, backend service, seed storage, question bank size, or difficulty behavior changes.
- An empty question bank must prevent quiz start with the message `目前沒有可用的題目。`.

---

## File Map

- Create `src/quizRandomization.js`: immutable Fisher–Yates shuffle, per-attempt question preparation, and scoring helpers.
- Create `test/quiz-randomization.test.mjs`: deterministic unit tests for permutation integrity, immutability, correctness, and scoring.
- Modify `src/App.jsx`: create and retain the per-attempt quiz; render, score, and review its option objects.
- Modify `README.md`: document that each new attempt randomizes questions and options.

---

### Task 1: Pure quiz preparation and scoring

**Files:**
- Create: `src/quizRandomization.js`
- Create: `test/quiz-randomization.test.mjs`

**Interfaces:**
- Produces: `shuffleCopy(items: Array<T>, random?: () => number): Array<T>`
- Produces: `prepareQuiz(questions: Array<SourceQuestion>, random?: () => number): Array<AttemptQuestion>`
- Produces: `isAnswerCorrect(question: AttemptQuestion, selectedIndex: number | undefined): boolean`
- Produces: `scoreQuiz(questions: Array<AttemptQuestion>, answers: Record<string, number>): { correctCount: number, wrongIds: Array<string> }`
- `SourceQuestion` has `{ id, n, text, options: string[], correct: number }`.
- `AttemptQuestion` preserves `{ id, n, text }` and replaces options with `{ text: string, isCorrect: boolean }[]`; it has no `correct` property.

- [ ] **Step 1: Write failing deterministic shuffle tests**

Create `test/quiz-randomization.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  isAnswerCorrect,
  prepareQuiz,
  scoreQuiz,
  shuffleCopy,
} from "../src/quizRandomization.js";

const questions = [
  {
    id: "q1",
    n: 1,
    text: "第一題",
    options: ["甲", "乙", "丙", "丁"],
    correct: 1,
  },
  {
    id: "q2",
    n: 2,
    text: "第二題",
    options: ["戊", "己", "庚", "辛"],
    correct: 3,
  },
];

const alwaysZero = () => 0;

test("shuffleCopy returns a changed copy without mutating its input", () => {
  const input = ["A", "B", "C", "D"];
  const result = shuffleCopy(input, alwaysZero);
  assert.deepEqual(result, ["B", "C", "D", "A"]);
  assert.deepEqual(input, ["A", "B", "C", "D"]);
  assert.notEqual(result, input);
});

test("prepareQuiz preserves every question and option exactly once", () => {
  const sourceSnapshot = structuredClone(questions);
  const prepared = prepareQuiz(questions, alwaysZero);

  assert.deepEqual(prepared.map(({ id }) => id), ["q2", "q1"]);
  assert.deepEqual(
    prepared.map(({ id }) => id).sort(),
    questions.map(({ id }) => id).sort(),
  );
  for (const preparedQuestion of prepared) {
    const source = questions.find(({ id }) => id === preparedQuestion.id);
    assert.deepEqual(
      preparedQuestion.options.map(({ text }) => text).sort(),
      [...source.options].sort(),
    );
    assert.equal(
      preparedQuestion.options.filter(({ isCorrect }) => isCorrect).length,
      1,
    );
    assert.equal("correct" in preparedQuestion, false);
  }
  assert.deepEqual(questions, sourceSnapshot);
});

test("prepared correctness survives option randomization and scores by stable id", () => {
  const prepared = prepareQuiz(questions, alwaysZero);
  const correctAnswers = Object.fromEntries(
    prepared.map((question) => [
      question.id,
      question.options.findIndex(({ isCorrect }) => isCorrect),
    ]),
  );
  assert.equal(
    prepared.every((question) =>
      isAnswerCorrect(question, correctAnswers[question.id]),
    ),
    true,
  );
  assert.deepEqual(scoreQuiz(prepared, correctAnswers), {
    correctCount: 2,
    wrongIds: [],
  });

  const oneMissing = { ...correctAnswers };
  delete oneMissing.q1;
  assert.deepEqual(scoreQuiz(prepared, oneMissing), {
    correctCount: 1,
    wrongIds: ["q1"],
  });
});

test("prepareQuiz rejects an empty question bank", () => {
  assert.throws(() => prepareQuiz([], alwaysZero), /empty-question-bank/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test test/quiz-randomization.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/quizRandomization.js`.

- [ ] **Step 3: Implement immutable Fisher–Yates and attempt preparation**

Create `src/quizRandomization.js`:

```js
export function shuffleCopy(items, random = Math.random) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[target]] = [
      shuffled[target],
      shuffled[index],
    ];
  }
  return shuffled;
}

export function prepareQuiz(questions, random = Math.random) {
  if (questions.length === 0) throw new Error("empty-question-bank");

  const prepared = questions.map((question) => ({
    id: question.id,
    n: question.n,
    text: question.text,
    options: shuffleCopy(
      question.options.map((text, index) => ({
        text,
        isCorrect: index === question.correct,
      })),
      random,
    ),
  }));
  return shuffleCopy(prepared, random);
}

export function isAnswerCorrect(question, selectedIndex) {
  return question.options[selectedIndex]?.isCorrect === true;
}

export function scoreQuiz(questions, answers) {
  const wrongIds = [];
  let correctCount = 0;
  for (const question of questions) {
    if (isAnswerCorrect(question, answers[question.id])) {
      correctCount += 1;
    } else {
      wrongIds.push(question.id);
    }
  }
  return { correctCount, wrongIds };
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
node --test test/quiz-randomization.test.mjs
```

Expected: 4 tests pass, 0 fail.

- [ ] **Step 5: Commit the pure module**

```bash
git add src/quizRandomization.js test/quiz-randomization.test.mjs
git commit -m "Add immutable quiz randomization"
```

---

### Task 2: Use one randomized quiz throughout an attempt

**Files:**
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `prepareQuiz(QUESTIONS): AttemptQuestion[]`
- Consumes: `isAnswerCorrect(question, selectedIndex): boolean`
- Consumes: `scoreQuiz(quizQuestions, answers): { correctCount, wrongIds }`
- Maintains: `quizQuestions` React state, created exactly once after each successful student verification.

- [ ] **Step 1: Add the attempt-question state and create it at quiz start**

At the top of `src/App.jsx`, import:

```js
import {
  isAnswerCorrect,
  prepareQuiz,
  scoreQuiz,
} from "./quizRandomization";
```

Inside `App`, add:

```js
const [quizQuestions, setQuizQuestions] = useState([]);
```

In `startQuiz`, after `validateStudentEntry` succeeds and before `setView("quiz")`, prepare the questions once:

```js
let preparedQuestions;
try {
  preparedQuestions = prepareQuiz(QUESTIONS);
} catch {
  setIdentityError("目前沒有可用的題目。");
  return;
}
setQuizQuestions(preparedQuestions);
```

Keep `setAnswers({})` and `setCurrent(0)` in the same successful start path. Do not call `prepareQuiz` from rendering, `goNext`, `goPrev`, option selection, or scoring.

- [ ] **Step 2: Navigate and render from the stable attempt questions**

Replace all active-quiz uses of `QUESTIONS[current]` and `QUESTIONS.length` with `quizQuestions[current]` and `quizQuestions.length`:

```jsx
<QuizView
  question={quizQuestions[current]}
  index={current}
  total={quizQuestions.length}
  selected={answers[quizQuestions[current].id]}
  onSelect={(idx) => selectOption(quizQuestions[current].id, idx)}
  ...
/>
```

Update `goNext`:

```js
if (current < quizQuestions.length - 1) {
  setCurrent((value) => value + 1);
} else {
  void finishQuiz();
}
```

In `QuizView`, options are now objects. Render `opt.text`, while keeping the visible `LETTERS[idx]` based on the attempt order:

```jsx
<p>
  第 {index + 1} 題 ／ 共 {total} 題
</p>

{question.options.map((option, idx) => (
  // existing button and selection markup
  <span>{option.text}</span>
))}
```

- [ ] **Step 3: Score and update progress from the attempt representation**

At the start of `finishQuiz`, compute:

```js
const { correctCount } = scoreQuiz(quizQuestions, answers);
```

Remove the local `correctCount` increment from the existing loop. Change the progress loop from `QUESTIONS.forEach` to:

```js
quizQuestions.forEach((question) => {
  const wasCorrect = isAnswerCorrect(question, answers[question.id]);
  const prevEntry = next[question.id] || { errorCount: 0, stage: -1 };
  // retain the existing correct/wrong progress update using question.id
});
```

Build the saved attempt using:

```js
correctCount,
totalQuestions: quizQuestions.length,
```

The saved Firestore shape remains unchanged.

- [ ] **Step 4: Make results use the exact options seen during the attempt**

Compute wrong IDs from the prepared attempt:

```js
const { wrongIds } =
  quizQuestions.length > 0
    ? scoreQuiz(quizQuestions, answers)
    : { wrongIds: [] };
```

Pass `questions={quizQuestions}` into `ResultsView`. Change its signature and wrong-question lookup:

```js
function ResultsView({ questions, wrongIds, answers, ...rest }) {
  const wrongQuestions = questions.filter((question) =>
    wrongIds.includes(question.id),
  );
  const attemptPosition = (questionId) =>
    questions.findIndex(({ id }) => id === questionId) + 1;
```

Render selected and correct choices from option objects:

```jsx
{answers[q.id] !== undefined
  ? `(${LETTERS[answers[q.id]]}) ${q.options[answers[q.id]].text}`
  : "未作答"}
```

```jsx
{(() => {
  const correctIndex = q.options.findIndex(({ isCorrect }) => isCorrect);
  return `(${LETTERS[correctIndex]}) ${q.options[correctIndex].text}`;
})()}
```

Label a wrong question with its current-attempt position:

```jsx
本次第 {attemptPosition(q.id)} 題 ・ 累計錯誤{" "}
{reviewList.find((item) => item.id === q.id)?.errorCount || 1} 次
```

In the Ebbinghaus review schedule, replace the original-number label `第 {r.n} 題` with the existing resolved question text:

```jsx
<p className="text-xs truncate">{r.text}</p>
```

Do not render `question.n`, `q.n`, or `r.n` in quiz or results views. `reviewList` may continue to use source `QUESTIONS` only to resolve historical question text by stable ID.

- [ ] **Step 5: Clear the attempt representation only when clearing all progress**

In `resetProgress`, add:

```js
setQuizQuestions([]);
```

Do not clear it when entering results, so results remain consistent with the completed attempt. The existing retry action calls `startQuiz`, which creates a fresh order after verifying the student again.

- [ ] **Step 6: Verify application tests, lint, and build**

Run:

```bash
npm test
npm run lint
npm run build
git diff --check
test -f dist/index.html
test -f dist/teacher.html
```

Expected: all application tests pass, lint exits 0, both Vite entries build, and no whitespace errors occur.

- [ ] **Step 7: Commit the React integration**

```bash
git add src/App.jsx
git commit -m "Randomize each quiz attempt"
```

---

### Task 3: Documentation and deployment verification

**Files:**
- Modify: `README.md`

**Interfaces:**
- Deployed student page remains `/junior-high-school-test/`.
- Teacher and parent records remain unchanged at `/junior-high-school-test/teacher.html`.

- [ ] **Step 1: Document the randomized attempt behavior**

In the student flow of `README.md`, replace the completion sentence with:

```markdown
3. 每次開始測驗時，題目與各題選項都會重新隨機排列；同一次測驗中順序保持固定。
4. 完成測驗後，每次成績會獨立保存；個人錯題複習進度仍以匿名帳號保存。
```

- [ ] **Step 2: Run the complete local verification gate**

Run:

```bash
npm ci --cache /private/tmp/junior-high-npm-cache
npm test
npm run lint
npm run build
git diff --check
test -f dist/index.html
test -f dist/teacher.html
```

Expected: clean install succeeds; all tests, lint, and build exit 0; both HTML entries exist.

- [ ] **Step 3: Commit documentation**

```bash
git add README.md
git commit -m "Document randomized quiz attempts"
```

- [ ] **Step 4: Push and verify GitHub Pages**

Push the approved integration branch to `main` according to the finishing-branch workflow. Wait for the `Deploy to GitHub Pages` workflow for the final commit and confirm both build and deploy jobs succeed.

- [ ] **Step 5: Run public behavior checks**

At the deployed student URL:

1. Start a valid test attempt and record the first three question texts and their option order.
2. Navigate forward and backward; confirm those questions and options remain unchanged.
3. Complete or restart the attempt, start a new attempt, and confirm the order differs.
4. Select a correct option after it has moved from its original letter and confirm scoring treats it as correct.
5. Confirm results show the same option letters/text seen during the attempt and do not show original question numbers.
6. Confirm the teacher portal still loads and no new Firestore permission errors appear.

Do not create or delete Firebase authorization documents solely for this feature; reuse an already-approved test student if one exists. If no approved test student exists, report the public randomization E2E as blocked rather than weakening access rules.
