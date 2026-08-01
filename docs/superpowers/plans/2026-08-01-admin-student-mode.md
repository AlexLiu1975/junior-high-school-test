# 管理員「我的學生」模式 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓已驗證管理員可在「管理模式／我的學生」間切換，直接建立自己的學生與專屬代碼，並只在「我的學生」模式查看這些學生的紀錄。

**Architecture:** 將純資料衍生與路徑建構留在 `teacherDomain.js`，Firestore transaction 與查詢留在 `teacherFirebase.js`，`TeacherApp.jsx` 只管理模式與畫面狀態。以 `adminStudentLinks/{adminUid}/students/{studentId}` 建立最小歸屬關係，並以 Firestore Rules 限制只能由指定且已驗證的管理員建立與讀取。

**Tech Stack:** React 19、Firebase Auth 12、Cloud Firestore、Firestore Security Rules、Node.js test runner、Firebase Rules Unit Testing、Vite、oxlint。

## Global Constraints

- 管理員信箱固定為 `beyle931224@gmail.com`，且必須 `email_verified == true`。
- 學生代碼格式固定為 Asia/Taipei 日期的 `YYYYMMDD-NNN`，每日流水號範圍為 001–999。
- 管理員不建立自己的 `accessRequests`，一般教師與家長的申請審核流程不得改變。
- 建立學生、登入索引、管理員關聯及流水號更新必須在單一 Firestore transaction 完成。
- 不新增刪除、改名、換碼、學生轉移或多管理員設定功能。
- 測驗紀錄維持不可更新、不可刪除。

---

### Task 1: 管理員學生的純資料契約

**Files:**
- Modify: `src/teacherDomain.js`
- Test: `test/teacher-domain.test.mjs`

**Interfaces:**
- Consumes: `normalizeStudentName(name)`、`formatStudentCode(date, sequence)`。
- Produces: `buildAdminStudentPaths({ adminUid, studentName, requestedAt, sequence })`，回傳 `{ studentName, studentCode, counterPath, entryPath, linkCollectionPath }`。

- [ ] **Step 1: Write the failing path-contract tests**

在 `test/teacher-domain.test.mjs` 匯入 `buildAdminStudentPaths` 並新增：

```js
test("builds admin-owned student paths with the shared daily sequence", () => {
  assert.deepEqual(
    buildAdminStudentPaths({
      adminUid: "admin-uid",
      studentName: " 王小明 ",
      requestedAt: new Date("2026-07-31T16:30:00.000Z"),
      sequence: 7,
    }),
    {
      studentName: "王小明",
      studentCode: "20260801-007",
      counterPath: "dailyCounters/20260801",
      entryPath: "studentEntries/20260801-007/names/王小明",
      linkCollectionPath: "adminStudentLinks/admin-uid/students",
    },
  );
});

test("rejects invalid admin-owned student input", () => {
  assert.throws(
    () => buildAdminStudentPaths({
      adminUid: "",
      studentName: "王小明",
      requestedAt: new Date(),
      sequence: 1,
    }),
    /invalid-admin-uid/,
  );
  assert.throws(
    () => buildAdminStudentPaths({
      adminUid: "admin-uid",
      studentName: "王/小明",
      requestedAt: new Date(),
      sequence: 1,
    }),
    /invalid-student-name/,
  );
});
```

- [ ] **Step 2: Run the domain test and verify RED**

Run: `node --test test/teacher-domain.test.mjs`

Expected: FAIL because `buildAdminStudentPaths` is not exported.

- [ ] **Step 3: Implement the minimal path builder**

在 `src/teacherDomain.js` 新增：

```js
export function buildAdminStudentPaths({
  adminUid,
  studentName,
  requestedAt,
  sequence,
}) {
  if (!adminUid) throw new Error("invalid-admin-uid");
  const name = normalizeStudentName(studentName);
  if (!name || name.length > 40 || name.includes("/")) {
    throw new Error("invalid-student-name");
  }
  const studentCode = formatStudentCode(requestedAt, sequence);
  const dateKey = studentCode.slice(0, 8);
  return {
    studentName: name,
    studentCode,
    counterPath: `dailyCounters/${dateKey}`,
    entryPath: `studentEntries/${studentCode}/names/${name}`,
    linkCollectionPath: `adminStudentLinks/${adminUid}/students`,
  };
}
```

- [ ] **Step 4: Run the domain test and verify GREEN**

Run: `node --test test/teacher-domain.test.mjs`

Expected: all teacher-domain tests PASS.

- [ ] **Step 5: Commit the contract**

```bash
git add src/teacherDomain.js test/teacher-domain.test.mjs
git commit -m "Add admin student path contract"
```

---

### Task 2: Firestore transaction 與管理員學生查詢

**Files:**
- Create: `src/adminStudentService.js`
- Create: `test/admin-student-service.test.mjs`
- Modify: `src/teacherFirebase.js`

**Interfaces:**
- Consumes: `buildAdminStudentPaths(...)` from Task 1、Firebase transaction primitives supplied by `teacherFirebase.js`。
- Produces: `planAdminStudentCreation(...)` pure mutation plan、`createAdminStudent(studentName)`、`listAdminStudents()`、`listAttemptsForStudentIds(studentIds)`。

- [ ] **Step 1: Write failing mutation-plan tests**

建立 `test/admin-student-service.test.mjs`：

```js
import assert from "node:assert/strict";
import test from "node:test";
import { planAdminStudentCreation } from "../src/adminStudentService.js";

test("plans every write for one admin-owned student", () => {
  const result = planAdminStudentCreation({
    adminUid: "admin-uid",
    studentId: "student-1",
    studentName: "王小明",
    studentCode: "20260801-001",
    sequence: 1,
  });
  assert.deepEqual(result, {
    student: {
      name: "王小明",
      code: "20260801-001",
      active: true,
      ownerUid: "admin-uid",
      ownerType: "admin",
    },
    entry: { active: true, studentId: "student-1" },
    link: { studentId: "student-1" },
    nextSequence: 2,
  });
});
```

- [ ] **Step 2: Run the service test and verify RED**

Run: `node --test test/admin-student-service.test.mjs`

Expected: FAIL because `src/adminStudentService.js` does not exist.

- [ ] **Step 3: Implement the pure mutation plan**

建立 `src/adminStudentService.js`：

```js
export function planAdminStudentCreation({
  adminUid,
  studentId,
  studentName,
  studentCode,
  sequence,
}) {
  return {
    student: {
      name: studentName,
      code: studentCode,
      active: true,
      ownerUid: adminUid,
      ownerType: "admin",
    },
    entry: { active: true, studentId },
    link: { studentId },
    nextSequence: sequence + 1,
  };
}
```

- [ ] **Step 4: Run the service test and verify GREEN**

Run: `node --test test/admin-student-service.test.mjs`

Expected: PASS.

- [ ] **Step 5: Add Firebase transaction implementation**

在 `src/teacherFirebase.js` 匯入 `buildAdminStudentPaths` 與 `planAdminStudentCreation`，並新增：

```js
export async function createAdminStudent(studentName) {
  const admin = requireAdmin();
  const studentRef = doc(collection(teacherDb, "students"));
  const requestedAt = new Date();
  return runTransaction(teacherDb, async (transaction) => {
    const initial = buildAdminStudentPaths({
      adminUid: admin.uid,
      studentName,
      requestedAt,
      sequence: 1,
    });
    const counterRef = doc(teacherDb, initial.counterPath);
    const counterSnapshot = await transaction.get(counterRef);
    const sequence = counterSnapshot.exists()
      ? (counterSnapshot.data().nextSequence ?? 1)
      : 1;
    const paths = buildAdminStudentPaths({
      adminUid: admin.uid,
      studentName,
      requestedAt,
      sequence,
    });
    const writes = planAdminStudentCreation({
      adminUid: admin.uid,
      studentId: studentRef.id,
      studentName: paths.studentName,
      studentCode: paths.studentCode,
      sequence,
    });
    transaction.set(studentRef, {
      ...writes.student,
      createdAt: serverTimestamp(),
    });
    transaction.set(doc(teacherDb, paths.entryPath), writes.entry);
    transaction.set(
      doc(teacherDb, paths.linkCollectionPath, studentRef.id),
      { ...writes.link, createdAt: serverTimestamp() },
    );
    transaction.set(counterRef, { nextSequence: writes.nextSequence });
    return {
      studentId: studentRef.id,
      studentName: paths.studentName,
      studentCode: paths.studentCode,
    };
  });
}
```

同檔新增查詢：

```js
export async function listAdminStudents() {
  const admin = requireAdmin();
  const links = await getDocs(
    collection(teacherDb, "adminStudentLinks", admin.uid, "students"),
  );
  const snapshots = await Promise.all(
    links.docs.map((link) => getDoc(doc(teacherDb, "students", link.id))),
  );
  return snapshots
    .filter((snapshot) => snapshot.exists())
    .map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }));
}

export async function listAttemptsForStudentIds(studentIds) {
  requireAdmin();
  if (studentIds.length === 0) return [];
  const chunks = [];
  for (let index = 0; index < studentIds.length; index += 30) {
    chunks.push(studentIds.slice(index, index + 30));
  }
  const snapshots = await Promise.all(
    chunks.map((ids) =>
      getDocs(query(collection(teacherDb, "quizAttempts"), where("studentId", "in", ids))),
    ),
  );
  return snapshots
    .flatMap((snapshot) => snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
    .sort(newestFirst);
}
```

- [ ] **Step 6: Run focused and full unit tests**

Run: `node --test test/admin-student-service.test.mjs test/teacher-domain.test.mjs`

Expected: PASS.

Run: `npm test`

Expected: all non-emulator tests PASS; Firestore Rules tests remain skipped in this command.

- [ ] **Step 7: Commit the data layer**

```bash
git add src/adminStudentService.js src/teacherFirebase.js test/admin-student-service.test.mjs
git commit -m "Add admin-owned student data flow"
```

---

### Task 3: Firestore Security Rules

**Files:**
- Modify: `firestore.rules`
- Modify: `test/firestore.rules.test.mjs`

**Interfaces:**
- Consumes: collection paths and fields from Tasks 1–2。
- Produces: verified-admin-only permissions for student creation, login entry, admin link and counter writes; read access for the admin's own links and linked students.

- [ ] **Step 1: Add failing Rules tests**

在 emulator seed 建立：

```js
await setDoc(doc(db, "students/admin-student-1"), {
  name: "王小明",
  code: "20260801-001",
  active: true,
  ownerUid: "admin-uid",
  ownerType: "admin",
});
await setDoc(doc(db, "adminStudentLinks/admin-uid/students/admin-student-1"), {
  studentId: "admin-student-1",
});
```

新增測試，確認管理員成功、一般家長與未驗證管理員失敗：

```js
rulesTest("only the verified administrator manages own student links", async () => {
  const adminDb = environment
    .authenticatedContext("admin-uid", auth("admin-uid", "beyle931224@gmail.com"))
    .firestore();
  const parentDb = environment
    .authenticatedContext("parent-uid", auth("parent-uid", "parent@example.com"))
    .firestore();
  const unverifiedDb = environment
    .authenticatedContext(
      "admin-uid-2",
      auth("admin-uid-2", "beyle931224@gmail.com", false),
    )
    .firestore();

  const link = { studentId: "new-admin-student", createdAt: serverTimestamp() };
  await assertSucceeds(
    setDoc(doc(adminDb, "adminStudentLinks/admin-uid/students/new-admin-student"), link),
  );
  await assertFails(
    setDoc(doc(parentDb, "adminStudentLinks/parent-uid/students/attack"), link),
  );
  await assertFails(
    setDoc(doc(unverifiedDb, "adminStudentLinks/admin-uid-2/students/attack"), link),
  );
});
```

新增直接建立學生與相關索引的測試：

```js
rulesTest("only the verified administrator creates direct student records", async () => {
  const adminDb = environment
    .authenticatedContext("admin-uid", auth("admin-uid", "beyle931224@gmail.com"))
    .firestore();
  const parentDb = environment
    .authenticatedContext("parent-uid", auth("parent-uid", "parent@example.com"))
    .firestore();
  const student = {
    name: "李小華",
    code: "20260801-002",
    active: true,
    ownerUid: "admin-uid",
    ownerType: "admin",
    createdAt: serverTimestamp(),
  };

  await assertSucceeds(setDoc(doc(adminDb, "students/new-admin-student"), student));
  await assertSucceeds(
    setDoc(doc(adminDb, "studentEntries/20260801-002/names/李小華"), {
      active: true,
      studentId: "new-admin-student",
    }),
  );
  await assertSucceeds(
    setDoc(doc(adminDb, "dailyCounters/20260801"), { nextSequence: 3 }),
  );
  await assertFails(setDoc(doc(parentDb, "students/attack"), student));
  await assertFails(
    setDoc(doc(parentDb, "studentEntries/ATTACK/names/李小華"), {
      active: true,
      studentId: "attack",
    }),
  );
  await assertFails(
    setDoc(doc(parentDb, "dailyCounters/20260801"), { nextSequence: 999 }),
  );
});
```

- [ ] **Step 2: Run Rules tests and verify RED**

Run: `npm run test:rules`

Expected: FAIL on `adminStudentLinks` writes because the collection is currently denied by the catch-all rule.

- [ ] **Step 3: Add the minimal Rules match**

在 `firestore.rules` 新增：

```text
match /adminStudentLinks/{adminUid}/students/{studentId} {
  allow read, write: if isAdmin() && request.auth.uid == adminUid;
}
```

保留既有：

```text
match /students/{studentId} {
  allow read: if isAdmin() || isTeacher() || parentCanRead(studentId);
  allow write: if isAdmin();
}

match /studentEntries/{studentCode}/names/{studentName} {
  allow get: if signedIn();
  allow list: if false;
  allow write: if isAdmin();
}

match /dailyCounters/{dateKey} {
  allow read, write: if isAdmin();
}
```

- [ ] **Step 4: Run Rules tests and verify GREEN**

Run: `npm run test:rules`

Expected: all Rules tests PASS with zero skipped tests.

- [ ] **Step 5: Commit the Rules change**

```bash
git add firestore.rules test/firestore.rules.test.mjs
git commit -m "Allow verified admin student ownership"
```

---

### Task 4: 管理員模式切換介面

**Files:**
- Create: `src/adminModeDomain.js`
- Create: `test/admin-mode-domain.test.mjs`
- Modify: `src/TeacherApp.jsx`

**Interfaces:**
- Consumes: `createAdminStudent(name)`、`listAdminStudents()`、`listAttemptsForStudentIds(ids)` from Task 2。
- Produces: `getAdminViewData({ mode, allAttempts, ownStudents, ownAttempts })` and the UI modes `manage`／`students`。

- [ ] **Step 1: Write failing mode-selection tests**

建立 `test/admin-mode-domain.test.mjs`：

```js
import assert from "node:assert/strict";
import test from "node:test";
import { getAdminViewData } from "../src/adminModeDomain.js";

test("management mode shows all attempts", () => {
  assert.deepEqual(
    getAdminViewData({
      mode: "manage",
      allAttempts: [{ id: "all" }],
      ownStudents: [{ id: "student-1" }],
      ownAttempts: [{ id: "own" }],
    }),
    { students: [], attempts: [{ id: "all" }] },
  );
});

test("student mode shows only admin-owned students and attempts", () => {
  assert.deepEqual(
    getAdminViewData({
      mode: "students",
      allAttempts: [{ id: "all" }],
      ownStudents: [{ id: "student-1" }],
      ownAttempts: [{ id: "own" }],
    }),
    { students: [{ id: "student-1" }], attempts: [{ id: "own" }] },
  );
});
```

- [ ] **Step 2: Run the mode test and verify RED**

Run: `node --test test/admin-mode-domain.test.mjs`

Expected: FAIL because `src/adminModeDomain.js` does not exist.

- [ ] **Step 3: Implement the pure mode selector**

建立 `src/adminModeDomain.js`：

```js
export function getAdminViewData({
  mode,
  allAttempts,
  ownStudents,
  ownAttempts,
}) {
  return mode === "students"
    ? { students: ownStudents, attempts: ownAttempts }
    : { students: [], attempts: allAttempts };
}
```

- [ ] **Step 4: Run the mode test and verify GREEN**

Run: `node --test test/admin-mode-domain.test.mjs`

Expected: PASS.

- [ ] **Step 5: Add React state and data loading**

在 `TeacherApp.jsx`：

- 匯入 Task 2 的三個 Firebase functions 與 `getAdminViewData`。
- 新增 `adminMode`（預設 `"manage"`）、`adminStudents`、`adminAttempts`、`adminStudentName`。
- 管理員初次載入維持讀取全部紀錄；切換至 `students` 時呼叫 `listAdminStudents()`，再以 ID 呼叫 `listAttemptsForStudentIds()`。
- 管理員學生建立成功後清空輸入、顯示新代碼並重新載入自己的學生與紀錄。
- 建立失敗時分別顯示：`daily-code-limit` →「今天建立的學生數量已達上限」；其他錯誤 →「學生建立失敗，資料未變更，請稍後重試」。

模式切換按鈕使用：

```jsx
<div className="flex rounded-xl border bg-white p-1">
  <button
    className={adminMode === "manage" ? activeModeClass : inactiveModeClass}
    onClick={() => setAdminMode("manage")}
  >
    管理模式
  </button>
  <button
    className={adminMode === "students" ? activeModeClass : inactiveModeClass}
    onClick={() => setAdminMode("students")}
  >
    我的學生
  </button>
</div>
```

「我的學生」建立表單使用：

```jsx
<form onSubmit={createOwnStudent}>
  <label htmlFor="admin-student-name">學生姓名</label>
  <input
    id="admin-student-name"
    maxLength={40}
    required
    value={adminStudentName}
    onChange={(event) => setAdminStudentName(event.target.value)}
  />
  <button disabled={working}>{working ? "建立中…" : "建立學生與專屬代碼"}</button>
</form>
```

僅在 `adminMode === "manage"` 顯示待審核申請；僅在 `adminMode === "students"` 顯示建立表單及管理員自己的學生卡片。紀錄表使用 `getAdminViewData(...)` 的 `attempts`。

- [ ] **Step 6: Run unit tests, lint and build**

Run: `npm test && npm run lint && npm run build`

Expected: unit tests PASS、lint exit 0、Vite build exit 0；既有 bundle-size warning 可保留但不得有 build error。

- [ ] **Step 7: Commit the interface**

```bash
git add src/adminModeDomain.js src/TeacherApp.jsx test/admin-mode-domain.test.mjs
git commit -m "Add admin student mode switch"
```

---

### Task 5: 完整驗證、Rules 發布與 GitHub Pages 部署

**Files:**
- Verify: `firestore.rules`
- Verify: `dist/teacher.html`
- Verify: public `teacher.html`

**Interfaces:**
- Consumes: all tasks above。
- Produces: verified production Rules and deployed GitHub Pages revision。

- [ ] **Step 1: Run the complete local verification suite**

Run:

```bash
npm test
npm run test:rules
npm run lint
npm run build
git diff --check
```

Expected: all tests PASS, Rules tests have zero skips, lint/build exit 0, and `git diff --check` prints nothing.

- [ ] **Step 2: Manually verify the built teacher entry**

Run:

```bash
rg -n "管理模式|我的學生|建立學生與專屬代碼" dist/assets/teacher-*.js
```

Expected: the built teacher bundle contains all three labels.

- [ ] **Step 3: Deploy Firestore Rules**

Publish the exact repository `firestore.rules` to Firebase project `junior-high-school-test` using an authenticated Firebase CLI or the Firebase console. Confirm the published version contains:

```text
match /adminStudentLinks/{adminUid}/students/{studentId}
```

Do not describe local emulator success as production deployment success.

- [ ] **Step 4: Push the verified commits to `origin/main`**

Run:

```bash
git status -sb
git push origin main
```

Expected: push succeeds and `main` matches `origin/main`.

- [ ] **Step 5: Wait for GitHub Pages workflow success**

Check the workflow run for the pushed commit and require `status: completed` plus `conclusion: success`. If the run fails, inspect the failed job before retrying.

- [ ] **Step 6: Verify the public admin flow**

Open the deployed teacher page with a cache-busting query parameter and verify:

1. `beyle931224@gmail.com` enters management mode by default.
2. 「管理模式／我的學生」switch is visible.
3. Switching to 「我的學生」 shows the creation form and not the pending-requests section.
4. Create one named test student only with the user's explicit approval, because it writes production data.
5. Confirm the generated code is shown and the new student is listed.
6. Open the student page, enter that exact code and name, and confirm the student can begin a quiz.
7. Confirm switching back to management mode restores pending requests and all-attempt records.

- [ ] **Step 7: Record final evidence**

Report commit SHA, Rules publication confirmation, GitHub Actions run URL/status, public URL, test counts, and any production write that was intentionally skipped pending approval.
