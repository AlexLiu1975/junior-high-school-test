# Student Attempts and Teacher Parent Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require students to enter an approved student code and name, retain every quiz attempt, and provide a Google-authenticated teacher/parent page with administrator approval and role-scoped access.

**Architecture:** Keep the existing student React entry point and add a second Vite HTML entry for the teacher/parent portal. Put pure validation and record-building logic in testable modules, isolate student and portal Firebase clients, and enforce every sensitive boundary in Firestore Rules. Parent approvals create an atomic date-based student code and a scoped `viewerAccess` document; teachers receive whole-class access.

**Tech Stack:** React 19, Vite 8, Firebase Authentication 12, Cloud Firestore 12, Node test runner, Firebase Rules Unit Testing, Firebase Emulator Suite, GitHub Pages.

## Global Constraints

- Student name is trimmed, 1–40 characters, and cannot contain `/`.
- Student code format is exactly `YYYYMMDD-NNN`; the date is the request date in `Asia/Taipei`, and the daily sequence is `001`–`999`.
- Administrator email is exactly `beyle931224@gmail.com` and must be verified by Firebase Auth.
- Teachers can read all attempts; parents can read only attempts whose `studentId` is in their approved `studentIds`.
- Students must provide a valid code/name pair before starting and can create, but never read, update, or delete, shared attempt records.
- Teacher authentication uses a separately named Firebase App with in-memory persistence so it does not replace student anonymous authentication.
- Every production change follows red-green TDD and every completion claim requires fresh test, lint, build, Rules Emulator, deployment, and public-browser evidence.
- Public verification data must be deleted after the test.

---

## File Structure

- `src/firebaseConfig.js`: read and validate the shared Vite Firebase configuration.
- `src/quizDomain.js`: pure name/code normalization, attempt payload, and scoring helpers.
- `src/firebase.js`: student anonymous auth, progress, code/name validation, and attempt creation.
- `src/App.jsx`: student identity form and quiz UI orchestration.
- `teacher.html`: noindex HTML entry for the teacher/parent portal.
- `src/teacher-main.jsx`: React bootstrap for `teacher.html`.
- `src/TeacherApp.jsx`: portal state machine and UI.
- `src/teacherFirebase.js`: named Google Auth client, access requests, approvals, code generation, and scoped queries.
- `src/index.css`: shared styling for both entries.
- `firestore.rules`: authoritative Firestore access rules.
- `firebase.json`: Firestore rules and emulator configuration.
- `test/quiz-domain.test.mjs`: pure student validation and attempt tests.
- `test/teacher-domain.test.mjs`: request-state and code formatting tests.
- `test/firestore.rules.test.mjs`: Firestore Rules Emulator authorization matrix.
- `test/pages-deployment.test.mjs`: two-entry build/deployment regression tests.
- `README.md`: setup, Google provider, rules deployment, and user workflows.

---

### Task 1: Student identity and attempt domain model

**Files:**
- Create: `src/quizDomain.js`
- Create: `test/quiz-domain.test.mjs`

**Interfaces:**
- Produces: `normalizeStudentName(value): string`
- Produces: `normalizeStudentCode(value): string`
- Produces: `validateStudentIdentity({ studentName, studentCode }): { valid: boolean, studentName: string, studentCode: string, error: string | null }`
- Produces: `buildAttemptRecord({ identity, uid, quizId, quizTitle, correctCount, totalQuestions }): object`

- [ ] **Step 1: Write failing validation tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAttemptRecord,
  normalizeStudentCode,
  validateStudentIdentity,
} from "../src/quizDomain.js";

test("normalizes a student code and trims a valid name", () => {
  assert.equal(normalizeStudentCode(" 20260726-001 "), "20260726-001");
  assert.deepEqual(
    validateStudentIdentity({
      studentCode: " 20260726-001 ",
      studentName: " 王小明 ",
    }),
    {
      valid: true,
      studentCode: "20260726-001",
      studentName: "王小明",
      error: null,
    },
  );
});

test("rejects invalid names and codes", () => {
  for (const identity of [
    { studentCode: "", studentName: "王小明" },
    { studentCode: "20260726-01", studentName: "王小明" },
    { studentCode: "20260726-001", studentName: "" },
    { studentCode: "20260726-001", studentName: "王/小明" },
    { studentCode: "20260726-001", studentName: "甲".repeat(41) },
  ]) {
    assert.equal(validateStudentIdentity(identity).valid, false);
  }
});

test("builds a bounded attempt record", () => {
  assert.deepEqual(
    buildAttemptRecord({
      identity: {
        studentId: "student-1",
        studentCode: "20260726-001",
        studentName: "王小明",
      },
      uid: "anonymous-uid",
      quizId: "cell-microscope-quiz1",
      quizTitle: "第1回 第1、2單元｜細胞與顯微鏡",
      correctCount: 16,
      totalQuestions: 20,
    }),
    {
      quizId: "cell-microscope-quiz1",
      quizTitle: "第1回 第1、2單元｜細胞與顯微鏡",
      studentUid: "anonymous-uid",
      studentId: "student-1",
      studentCode: "20260726-001",
      studentName: "王小明",
      score: 80,
      correctCount: 16,
      wrongCount: 4,
    },
  );
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --test test/quiz-domain.test.mjs`  
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/quizDomain.js`.

- [ ] **Step 3: Implement the pure domain helpers**

```js
const CODE_PATTERN = /^\d{8}-\d{3}$/;

export const normalizeStudentName = (value) => String(value ?? "").trim();
export const normalizeStudentCode = (value) =>
  String(value ?? "").trim().toUpperCase();

export function validateStudentIdentity({ studentName, studentCode }) {
  const normalizedName = normalizeStudentName(studentName);
  const normalizedCode = normalizeStudentCode(studentCode);
  const validName =
    normalizedName.length >= 1 &&
    normalizedName.length <= 40 &&
    !normalizedName.includes("/");
  const validCode = CODE_PATTERN.test(normalizedCode);
  return {
    valid: validName && validCode,
    studentName: normalizedName,
    studentCode: normalizedCode,
    error:
      validName && validCode
        ? null
        : "請輸入有效的學生姓名與專屬代碼。",
  };
}

export function buildAttemptRecord({
  identity,
  uid,
  quizId,
  quizTitle,
  correctCount,
  totalQuestions,
}) {
  return {
    quizId,
    quizTitle,
    studentUid: uid,
    studentId: identity.studentId,
    studentCode: identity.studentCode,
    studentName: identity.studentName,
    score: Math.round((correctCount / totalQuestions) * 100),
    correctCount,
    wrongCount: totalQuestions - correctCount,
  };
}
```

- [ ] **Step 4: Verify GREEN**

Run: `node --test test/quiz-domain.test.mjs`  
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/quizDomain.js test/quiz-domain.test.mjs
git commit -m "Add student attempt domain model"
```

---

### Task 2: Student code validation and immutable attempt writes

**Files:**
- Modify: `src/firebase.js`
- Modify: `src/App.jsx`
- Modify: `test/quiz-domain.test.mjs`

**Interfaces:**
- Consumes: `validateStudentIdentity`, `buildAttemptRecord`
- Produces: `validateStudentEntry(studentCode, studentName): Promise<{ studentId, studentCode, studentName }>`
- Produces: `saveQuizAttempt(record): Promise<string>`

- [ ] **Step 1: Add a failing regression test for duplicate submission guards**

Add to `test/quiz-domain.test.mjs`:

```js
import { createAttemptGuard } from "../src/quizDomain.js";

test("attempt guard allows one write per completed run", () => {
  const guard = createAttemptGuard();
  assert.equal(guard.claim("run-1"), true);
  assert.equal(guard.claim("run-1"), false);
  assert.equal(guard.claim("run-2"), true);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test test/quiz-domain.test.mjs`  
Expected: FAIL because `createAttemptGuard` is not exported.

- [ ] **Step 3: Implement the guard and student Firestore APIs**

Add to `src/quizDomain.js`:

```js
export function createAttemptGuard() {
  const claimed = new Set();
  return {
    claim(runId) {
      if (claimed.has(runId)) return false;
      claimed.add(runId);
      return true;
    },
  };
}
```

Extend Firestore imports in `src/firebase.js` with `addDoc`, `collection`, and `serverTimestamp`, then add:

```js
export async function validateStudentEntry(studentCode, studentName) {
  requireFirebase();
  const ref = doc(db, "studentEntries", studentCode, "names", studentName);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists() || snapshot.data().active !== true) {
    throw new Error("student-entry-not-found");
  }
  return { studentId: snapshot.data().studentId, studentCode, studentName };
}

export async function saveQuizAttempt(record) {
  requireFirebase();
  const created = await addDoc(collection(db, "quizAttempts"), {
    ...record,
    submittedAt: serverTimestamp(),
  });
  return created.id;
}
```

- [ ] **Step 4: Update the student UI**

In `src/App.jsx`:

- add controlled `studentName`, `studentCode`, `verifiedIdentity`, `identityError`, and `starting` state;
- render labeled inputs `學生專屬代碼` and `測試人姓名` in `IntroView`;
- normalize/validate locally, then call `validateStudentEntry` before switching to quiz view;
- create a unique `runId` when the quiz starts;
- after scoring, call both `saveProgress` and `saveQuizAttempt(buildAttemptRecord(...))`;
- disable the completion button while saving;
- show the verified name on results;
- use `Promise.allSettled` so a progress failure and an attempt failure are reported independently;
- do not claim the run guard until immediately before the attempt write.

The start handler must follow this shape:

```js
const startQuiz = async () => {
  const checked = validateStudentIdentity({ studentName, studentCode });
  if (!checked.valid) {
    setIdentityError(checked.error);
    return;
  }
  setStarting(true);
  try {
    const identity = await validateStudentEntry(
      checked.studentCode,
      checked.studentName,
    );
    setVerifiedIdentity(identity);
    setRunId(crypto.randomUUID());
    setAnswers({});
    setCurrent(0);
    setView("quiz");
  } catch {
    setIdentityError("找不到相符的學生資料。");
  } finally {
    setStarting(false);
  }
};
```

- [ ] **Step 5: Verify the unit tests, lint, and build**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: all tests pass, lint exits 0, and Vite builds the student page.

- [ ] **Step 6: Commit**

```bash
git add src/quizDomain.js src/firebase.js src/App.jsx test/quiz-domain.test.mjs
git commit -m "Require student identity and save attempts"
```

---

### Task 3: Teacher portal authentication and application states

**Files:**
- Modify: `src/firebaseConfig.js`
- Create: `teacher.html`
- Create: `src/teacher-main.jsx`
- Create: `src/TeacherApp.jsx`
- Create: `src/teacherFirebase.js`
- Create: `src/teacherDomain.js`
- Create: `test/teacher-domain.test.mjs`
- Modify: `vite.config.js`
- Modify: `test/pages-deployment.test.mjs`

**Interfaces:**
- Produces: `getFirebaseConfig(): object`
- Produces: `getPortalState({ user, request, access, adminEmail }): "signed-out" | "apply" | "pending" | "rejected" | "teacher" | "parent" | "admin"`
- Produces: `signInTeacher(): Promise<User>`
- Produces: `submitAccessRequest({ user, role, studentName }): Promise<void>`
- Produces: `subscribeToOwnAccess(uid, callback): Unsubscribe`
- Produces: `listAttemptsForAccess(access): Promise<Array<object>>`

- [ ] **Step 1: Write failing portal-state and date-code tests**

Create `test/teacher-domain.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  formatStudentCode,
  getPortalState,
  validateAccessApplication,
} from "../src/teacherDomain.js";

const adminEmail = "beyle931224@gmail.com";

test("maps authentication and approval states", () => {
  assert.equal(getPortalState({ user: null, request: null, access: null, adminEmail }), "signed-out");
  assert.equal(getPortalState({ user: { email: "p@example.com" }, request: null, access: null, adminEmail }), "apply");
  assert.equal(getPortalState({ user: { email: "p@example.com" }, request: { status: "pending" }, access: null, adminEmail }), "pending");
  assert.equal(getPortalState({ user: { email: "p@example.com" }, request: null, access: { role: "parent" }, adminEmail }), "parent");
  assert.equal(getPortalState({ user: { email: adminEmail, emailVerified: true }, request: null, access: null, adminEmail }), "admin");
});

test("requires one student name for parent applications", () => {
  assert.equal(validateAccessApplication({ role: "teacher", studentName: "" }).valid, true);
  assert.equal(validateAccessApplication({ role: "parent", studentName: "" }).valid, false);
  assert.equal(validateAccessApplication({ role: "parent", studentName: "王小明" }).valid, true);
});

test("formats an Asia Taipei request date and sequence", () => {
  const date = new Date("2026-07-25T16:30:00.000Z");
  assert.equal(formatStudentCode(date, 1), "20260726-001");
  assert.throws(() => formatStudentCode(date, 1000), /daily-code-limit/);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test test/teacher-domain.test.mjs`  
Expected: FAIL because `src/teacherDomain.js` does not exist.

- [ ] **Step 3: Implement portal domain helpers**

Implement `src/teacherDomain.js` with:

```js
import { normalizeStudentName } from "./quizDomain.js";

export const ADMIN_EMAIL = "beyle931224@gmail.com";

export function getPortalState({ user, request, access, adminEmail = ADMIN_EMAIL }) {
  if (!user) return "signed-out";
  if (user.email === adminEmail && user.emailVerified) return "admin";
  if (access?.role === "teacher") return "teacher";
  if (access?.role === "parent") return "parent";
  if (request?.status === "pending") return "pending";
  if (request?.status === "rejected") return "rejected";
  return "apply";
}

export function validateAccessApplication({ role, studentName }) {
  const name = normalizeStudentName(studentName);
  const validRole = role === "teacher" || role === "parent";
  const validName =
    role === "teacher" ||
    (name.length >= 1 && name.length <= 40 && !name.includes("/"));
  return { valid: validRole && validName, role, studentName: role === "parent" ? name : null };
}

export function formatStudentCode(date, sequence) {
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 999) {
    throw new Error("daily-code-limit");
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}${values.month}${values.day}-${String(sequence).padStart(3, "0")}`;
}
```

- [ ] **Step 4: Create the named Firebase client**

Refactor `src/firebaseConfig.js` to export `getFirebaseConfig()` and retain `getMissingFirebaseConfigKeys`. In `src/teacherFirebase.js`, create:

```js
const teacherApp = initializeApp(getFirebaseConfig(), "teacher-portal");
const teacherAuth = initializeAuth(teacherApp, {
  persistence: inMemoryPersistence,
});
const teacherDb = getFirestore(teacherApp);
const provider = new GoogleAuthProvider();
```

Use `signInWithPopup`, `signOut`, `onAuthStateChanged`, `getDoc`, `setDoc`, `onSnapshot`, `query`, `where`, `orderBy`, and `getDocs`. `submitAccessRequest` writes only:

```js
{
  uid: user.uid,
  email: user.email,
  displayName: user.displayName ?? "",
  role,
  studentName: role === "parent" ? normalizedName : null,
  status: "pending",
  requestedAt: serverTimestamp(),
  reviewedAt: null,
  reviewedBy: null,
}
```

- [ ] **Step 5: Build the portal UI and second Vite entry**

`teacher.html` must include:

```html
<meta name="robots" content="noindex, nofollow" />
<div id="teacher-root"></div>
<script type="module" src="/src/teacher-main.jsx"></script>
```

`TeacherApp.jsx` must render each `getPortalState` state, role selection, parent student-name input, Google sign-in/out, and approved record tables. Parent queries use:

```js
query(
  collection(teacherDb, "quizAttempts"),
  where("studentId", "in", access.studentIds),
  orderBy("submittedAt", "desc"),
)
```

Teacher/admin queries use `orderBy("submittedAt", "desc")`. Search filtering occurs locally on already-authorized results.

Configure Vite multi-page input:

```js
build: {
  rolldownOptions: {
    input: {
      student: fileURLToPath(new URL("./index.html", import.meta.url)),
      teacher: fileURLToPath(new URL("./teacher.html", import.meta.url)),
    },
  },
},
```

- [ ] **Step 6: Extend the build regression test**

Add assertions that `teacher.html` exists, contains `noindex, nofollow`, and `npm run build` produces `dist/teacher.html`.

- [ ] **Step 7: Verify**

Run:

```bash
node --test test/teacher-domain.test.mjs test/pages-deployment.test.mjs
npm run lint
npm run build
test -f dist/teacher.html
```

Expected: tests pass, lint/build exit 0, and the teacher entry exists.

- [ ] **Step 8: Commit**

```bash
git add src/firebaseConfig.js teacher.html src/teacher-main.jsx src/TeacherApp.jsx src/teacherFirebase.js src/teacherDomain.js test/teacher-domain.test.mjs vite.config.js test/pages-deployment.test.mjs
git commit -m "Add teacher and parent access portal"
```

---

### Task 4: Administrator approval transaction and role-scoped records

**Files:**
- Modify: `src/teacherFirebase.js`
- Modify: `src/TeacherApp.jsx`
- Modify: `src/teacherDomain.js`
- Modify: `test/teacher-domain.test.mjs`

**Interfaces:**
- Produces: `approveTeacher(request): Promise<void>`
- Produces: `approveParent(request): Promise<{ studentId, studentCode }>`
- Produces: `rejectRequest(request): Promise<void>`
- Produces: `subscribeToPendingRequests(callback): Unsubscribe`

- [ ] **Step 1: Add failing transaction-input tests**

Add tests for `buildTeacherAccess`, `buildParentApprovalPaths`, and rejection of sequence `1000`. The expected parent path set for request date `2026-07-26` and sequence `1` is:

```js
{
  studentCode: "20260726-001",
  counterPath: "dailyCounters/20260726",
  entryPath: "studentEntries/20260726-001/names/王小明",
  accessPath: "viewerAccess/parent-uid",
  requestPath: "accessRequests/parent-uid",
}
```

- [ ] **Step 2: Verify RED**

Run: `node --test test/teacher-domain.test.mjs`  
Expected: FAIL because the approval helpers are missing.

- [ ] **Step 3: Implement approval helpers and transaction**

`approveParent` must:

1. load `accessRequests/{uid}` inside `runTransaction`;
2. return the existing student/code without writes if status is already `approved`;
3. derive the Taipei request date from `requestedAt`;
4. load `dailyCounters/{YYYYMMDD}`, using `nextSequence ?? 1`;
5. reject values above `999`;
6. create an auto-ID `students` reference before the transaction write;
7. write the student, exact student-entry path, parent `viewerAccess`, updated counter (`sequence + 1`), and approved request in the same transaction.

`approveTeacher` writes `viewerAccess/{uid}` with `{ role: "teacher", studentIds: [] }` and updates the request to approved in one batch. `rejectRequest` updates only `status`, `reviewedAt`, and `reviewedBy`.

- [ ] **Step 4: Add administrator UI**

For `portalState === "admin"`:

- subscribe to `accessRequests` where `status == "pending"`;
- show role, email, display name, requested student name, and request time;
- disable the row during approval/rejection;
- show the generated code after parent approval;
- never create a second code on a repeated click.

- [ ] **Step 5: Verify**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: all domain/build tests pass and both entries build.

- [ ] **Step 6: Commit**

```bash
git add src/teacherFirebase.js src/TeacherApp.jsx src/teacherDomain.js test/teacher-domain.test.mjs
git commit -m "Add administrator access approvals"
```

---

### Task 5: Firestore security rules and emulator authorization matrix

**Files:**
- Create: `firestore.rules`
- Create: `firebase.json`
- Create: `.firebaserc`
- Create: `test/firestore.rules.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Security boundary for all collections in the approved design.

- [ ] **Step 1: Install rules test tooling**

Run:

```bash
npm install --save-dev @firebase/rules-unit-testing firebase-tools
```

Add script:

```json
"test:rules": "firebase emulators:exec --only firestore \"node --test test/firestore.rules.test.mjs\""
```

Configure `firebase.json`:

```json
{
  "firestore": { "rules": "firestore.rules" },
  "emulators": { "firestore": { "port": 8080 } }
}
```

Configure `.firebaserc`:

```json
{ "projects": { "default": "junior-high-school-test" } }
```

- [ ] **Step 2: Write failing Rules Emulator tests**

Use `initializeTestEnvironment`, `assertSucceeds`, `assertFails`, and admin `withSecurityRulesDisabled`. Create authenticated contexts for:

- anonymous student;
- attacker student;
- pending parent;
- approved parent with `studentIds: ["student-1"]`;
- approved teacher;
- verified admin;
- unverified admin-email token.

Test all required cases:

```js
await assertSucceeds(studentAttemptRef.set(validAttempt));
await assertFails(attackerAttemptRef.set({ ...validAttempt, studentUid: "student-uid" }));
await assertFails(studentAttemptRef.update({ score: 100 }));
await assertFails(studentAttemptRef.delete());
await assertFails(pendingParent.collection("quizAttempts").get());
await assertSucceeds(teacher.collection("quizAttempts").get());
await assertSucceeds(
  approvedParent.collection("quizAttempts").where("studentId", "==", "student-1").get(),
);
await assertFails(approvedParent.collection("quizAttempts").get());
await assertFails(
  approvedParent.collection("quizAttempts").where("studentId", "==", "student-2").get(),
);
await assertFails(pendingParent.doc("accessRequests/parent-uid").update({ status: "approved" }));
await assertSucceeds(admin.doc("viewerAccess/parent-uid").set(validParentAccess));
await assertFails(unverifiedAdmin.doc("viewerAccess/parent-uid").set(validParentAccess));
```

- [ ] **Step 3: Verify RED against deny-all rules**

Create `firestore.rules` with only:

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

Run: `npm run test:rules`  
Expected: intended-success cases fail.

- [ ] **Step 4: Implement the complete rules**

Implement helper functions:

```text
function signedIn() { return request.auth != null; }
function isAdmin() {
  return signedIn()
    && request.auth.token.email == "beyle931224@gmail.com"
    && request.auth.token.email_verified == true;
}
function access() {
  return get(/databases/$(database)/documents/viewerAccess/$(request.auth.uid)).data;
}
function isTeacher() {
  return signedIn() && exists(/databases/$(database)/documents/viewerAccess/$(request.auth.uid))
    && access().role == "teacher";
}
function parentCanRead(studentId) {
  return signedIn() && exists(/databases/$(database)/documents/viewerAccess/$(request.auth.uid))
    && access().role == "parent"
    && studentId in access().studentIds;
}
```

Rules must use exact field allowlists (`keys().hasOnly(...)`), integer/range checks, `studentUid == request.auth.uid`, server-timestamp equality (`submittedAt == request.time`), and `get` of the exact student-entry document. Allow `get` but not `list` on `studentEntries`. Allow applicant create only with own UID/email, verified Google email, `status == "pending"`, and valid role/name pairing. Only admin may update request review fields or write approval/student/counter documents.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
npm run test:rules
npm test
npm run lint
npm run build
```

Expected: the complete Rules matrix and application checks pass.

- [ ] **Step 6: Commit**

```bash
git add firestore.rules firebase.json .firebaserc test/firestore.rules.test.mjs package.json package-lock.json
git commit -m "Enforce student and viewer access rules"
```

---

### Task 6: Documentation, Firebase configuration, deployment, and public E2E

**Files:**
- Modify: `README.md`
- Modify: `.github/workflows/deploy-pages.yml`

**Interfaces:**
- Deployed student page: `/junior-high-school-test/`
- Deployed portal: `/junior-high-school-test/teacher.html`

- [ ] **Step 1: Update documentation**

Document:

- enable Anonymous and Google providers;
- keep `alexliu1975.github.io` authorized;
- deploy `firestore.rules`;
- student code/name flow;
- teacher/parent application flow;
- administrator approval flow;
- privacy warning and `beyle931224@gmail.com` bootstrap;
- exact local checks: `npm test`, `npm run test:rules`, `npm run lint`, `npm run build`.

- [ ] **Step 2: Run the complete local verification gate**

Run:

```bash
npm ci --cache /private/tmp/junior-high-npm-cache
npm test
npm run test:rules
npm run lint
npm run build
git diff --check
```

Expected: all commands exit 0; `dist/index.html` and `dist/teacher.html` exist.

- [ ] **Step 3: Commit and push application changes**

```bash
git add README.md .github/workflows/deploy-pages.yml
git commit -m "Document student and viewer workflows"
git push origin main
```

- [ ] **Step 4: Deploy Firestore rules**

Use Firebase CLI `firebase deploy --only firestore:rules --project junior-high-school-test`, or paste the exact checked-in `firestore.rules` into Firebase Console and publish. Confirm the deployed rules timestamp after publishing.

- [ ] **Step 5: Enable Google Authentication**

In Firebase Console Authentication → Sign-in method:

- keep Anonymous enabled;
- enable Google;
- choose the project support email;
- retain `alexliu1975.github.io` in Authorized domains.

- [ ] **Step 6: Verify GitHub Pages deployment**

Wait for the `Deploy to GitHub Pages` workflow triggered by the final push. Confirm both build and deploy jobs succeed and the artifact contains `teacher.html`.

- [ ] **Step 7: Run public student E2E**

1. Confirm blank/invalid code and name cannot start.
2. Use a temporary admin-created parent request to generate a code.
3. Confirm a wrong name with the code is rejected.
4. Complete the quiz twice with the valid pair.
5. Confirm two distinct attempt documents exist.
6. Confirm reload preserves personal progress.

- [ ] **Step 8: Run public viewer E2E**

1. Confirm an unapproved Google account can apply but cannot read attempts.
2. Confirm the admin sees the pending request.
3. Approve a parent and confirm the generated code matches `YYYYMMDD-NNN`.
4. Confirm the parent sees only the linked student's two attempts.
5. Approve a teacher test account and confirm it sees all attempts.
6. Confirm teacher portal login does not replace the student anonymous UID.
7. Confirm browser console has no Firebase errors.

- [ ] **Step 9: Remove public test data**

Delete only the explicitly created E2E request, access, student, student-entry, and attempt documents through the administrator UI or Firebase Console. Retain the daily counter to prevent code reuse. Reload both pages and confirm the test student and attempts are absent.

- [ ] **Step 10: Final verification report**

Report:

- commit SHAs;
- unit and Rules test counts;
- lint/build results;
- workflow run URL;
- public student and teacher URLs;
- Firebase provider/rules state;
- E2E scenarios passed;
- any warning not affecting correctness, such as dependency chunk-size warnings.
