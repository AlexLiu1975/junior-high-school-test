# 三角色入口首頁 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增三個橫條入口的公開首頁，將既有學生測驗移至 `quiz.html`，並保留教師／家長共用登入及 Firebase 實際權限控制。

**Architecture:** 使用 `entryDomain.js` 保存可測試的入口與登入說明契約，`HomeApp.jsx` 只呈現靜態導覽，`HomeLink.jsx` 提供測驗頁及紀錄頁共用的返回首頁連結。Vite 改為三入口 build；教師頁的 `entry` 參數只選擇說明文字，不參與授權或預設申請角色。

**Tech Stack:** React 19、Vite 8、Tailwind CSS 4、Node.js test runner、Firebase 12、GitHub Pages。

## Global Constraints

- 首頁只呈現靜態導覽，不讀取 Firebase、不要求登入，也不顯示學生或測驗資料。
- 首頁依序顯示「學生開始測驗」、「教師／管理員」、「家長查看紀錄」三個整排橫條。
- `/junior-high-school-test/` 是首頁；學生測驗移至 `/junior-high-school-test/quiz.html`。
- `teacher.html?entry=teacher` 與 `teacher.html?entry=parent` 只改變登入前說明，實際權限仍由 Firebase Authentication、Firestore 資料及 Security Rules 決定。
- 缺少或未知 `entry` 時維持目前通用登入說明；既有 `teacher.html` 直接網址必須繼續可用。
- `quiz.html` 與 `teacher.html` 都提供「返回首頁」。
- 不修改 Firestore collection、文件格式或 Security Rules。
- 不加入公告、公告管理、註冊、首頁後台編輯或其他新功能。

---

### Task 1: 入口與登入說明的純資料契約

**Files:**
- Create: `src/entryDomain.js`
- Create: `test/entry-domain.test.mjs`

**Interfaces:**
- Consumes: `entry` query parameter as `string | null | undefined`。
- Produces: `HOME_ENTRIES` array and `getTeacherEntryDescription(entry): string`。

- [ ] **Step 1: Write the failing entry-contract tests**

建立 `test/entry-domain.test.mjs`：

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  HOME_ENTRIES,
  getTeacherEntryDescription,
} from "../src/entryDomain.js";

test("defines the three homepage destinations in display order", () => {
  assert.deepEqual(HOME_ENTRIES, [
    {
      id: "student",
      title: "學生開始測驗",
      description: "使用專屬代碼＋學生姓名進入",
      href: "quiz.html",
      primary: true,
    },
    {
      id: "teacher",
      title: "教師／管理員",
      description: "審核申請、建立學生、查看全部紀錄",
      href: "teacher.html?entry=teacher",
      primary: false,
    },
    {
      id: "parent",
      title: "家長查看紀錄",
      description: "使用 Google 帳號查看已指定學生",
      href: "teacher.html?entry=parent",
      primary: false,
    },
  ]);
});

test("derives teacher, parent, and fallback sign-in descriptions", () => {
  assert.equal(
    getTeacherEntryDescription("teacher"),
    "使用 Google 帳號登入後，可申請教師權限或進入管理功能。",
  );
  assert.equal(
    getTeacherEntryDescription("parent"),
    "使用 Google 帳號登入後，可申請查看指定學生的測驗紀錄。",
  );
  assert.equal(
    getTeacherEntryDescription("unknown"),
    "首次登入後，可申請教師或家長查閱權限。",
  );
  assert.equal(
    getTeacherEntryDescription(null),
    "首次登入後，可申請教師或家長查閱權限。",
  );
});
```

- [ ] **Step 2: Run the entry-domain test and verify RED**

Run: `node --test test/entry-domain.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/entryDomain.js`.

- [ ] **Step 3: Implement the minimal entry contract**

建立 `src/entryDomain.js`：

```js
export const HOME_ENTRIES = Object.freeze([
  Object.freeze({
    id: "student",
    title: "學生開始測驗",
    description: "使用專屬代碼＋學生姓名進入",
    href: "quiz.html",
    primary: true,
  }),
  Object.freeze({
    id: "teacher",
    title: "教師／管理員",
    description: "審核申請、建立學生、查看全部紀錄",
    href: "teacher.html?entry=teacher",
    primary: false,
  }),
  Object.freeze({
    id: "parent",
    title: "家長查看紀錄",
    description: "使用 Google 帳號查看已指定學生",
    href: "teacher.html?entry=parent",
    primary: false,
  }),
]);

const fallbackDescription = "首次登入後，可申請教師或家長查閱權限。";

export function getTeacherEntryDescription(entry) {
  if (entry === "teacher") {
    return "使用 Google 帳號登入後，可申請教師權限或進入管理功能。";
  }
  if (entry === "parent") {
    return "使用 Google 帳號登入後，可申請查看指定學生的測驗紀錄。";
  }
  return fallbackDescription;
}
```

- [ ] **Step 4: Run focused and full tests**

Run: `node --test test/entry-domain.test.mjs`

Expected: 2 tests PASS.

Run: `npm test`

Expected: all non-emulator tests PASS; existing Rules tests may remain skipped under the general test command.

- [ ] **Step 5: Commit the contract**

```bash
git add src/entryDomain.js test/entry-domain.test.mjs
git commit -m "Add role entry navigation contract"
```

---

### Task 2: 三入口首頁與三頁 Vite build

**Files:**
- Create: `src/HomeApp.jsx`
- Create: `src/home-main.jsx`
- Create: `quiz.html`
- Modify: `index.html`
- Modify: `vite.config.js`
- Modify: `test/pages-deployment.test.mjs`

**Interfaces:**
- Consumes: `HOME_ENTRIES` from Task 1 and `import.meta.env.BASE_URL` from Vite。
- Produces: `index.html` homepage, `quiz.html` student entry, and three named Vite inputs: `home`, `quiz`, `teacher`。

- [ ] **Step 1: Write failing build-entry tests**

在 `test/pages-deployment.test.mjs` 新增：

```js
test("homepage, quiz, and teacher are separate Vite entries", async () => {
  const { default: config } = await import("../vite.config.js");
  const inputs = config.build.rolldownOptions.input;

  assert.match(inputs.home, /index\.html$/);
  assert.match(inputs.quiz, /quiz\.html$/);
  assert.match(inputs.teacher, /teacher\.html$/);
});

test("homepage and quiz HTML load their dedicated React entries", async () => {
  const [homeHtml, quizHtml] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../quiz.html", import.meta.url), "utf8"),
  ]);

  assert.match(homeHtml, /src\/home-main\.jsx/);
  assert.match(homeHtml, /<title>測驗學習平台<\/title>/);
  assert.match(quizHtml, /src\/main\.jsx/);
  assert.match(quizHtml, /<title>細胞與顯微鏡 隨堂測驗<\/title>/);
});
```

- [ ] **Step 2: Run the deployment test and verify RED**

Run: `node --test test/pages-deployment.test.mjs`

Expected: FAIL because `quiz.html` and the `home`/`quiz` Vite inputs do not exist.

- [ ] **Step 3: Move the existing quiz HTML contract to `quiz.html`**

建立 `quiz.html`，內容使用目前 `index.html` 的 head、`#root` 及 `/src/main.jsx` script，不改學生測驗程式。`<title>` 必須保持：

```html
<title>細胞與顯微鏡 隨堂測驗</title>
```

- [ ] **Step 4: Replace `index.html` with the homepage entry**

`index.html` 保留 `zh-Hant`、viewport、現有字型 preconnect 與字型 stylesheet，將 title、root 與 script 改為：

```html
<title>測驗學習平台</title>
<!-- body -->
<div id="home-root"></div>
<script type="module" src="/src/home-main.jsx"></script>
```

- [ ] **Step 5: Add the homepage React entry**

建立 `src/home-main.jsx`：

```jsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import HomeApp from "./HomeApp.jsx";

createRoot(document.getElementById("home-root")).render(
  <StrictMode>
    <HomeApp />
  </StrictMode>,
);
```

- [ ] **Step 6: Implement the approved horizontal homepage**

建立 `src/HomeApp.jsx`。以 `<main>`、標題與 `HOME_ENTRIES.map(...)` 產生三個 `<a>`；href 必須使用 `${import.meta.env.BASE_URL}${entry.href}`。學生入口依 `entry.primary` 使用 emerald 主色，其餘使用白底邊框。每個連結都包含圓形序號、標題、說明及 `aria-hidden="true"` 的箭頭。外層及連結至少包含以下可及性與響應式類別：

```jsx
className="min-h-screen bg-stone-50 px-4 py-10 text-slate-900 sm:px-6"
```

```jsx
className="block rounded-2xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300"
```

- [ ] **Step 7: Configure all three Vite inputs**

將 `vite.config.js` 的 input 改為：

```js
input: {
  home: fileURLToPath(new URL('./index.html', import.meta.url)),
  quiz: fileURLToPath(new URL('./quiz.html', import.meta.url)),
  teacher: fileURLToPath(new URL('./teacher.html', import.meta.url)),
},
```

- [ ] **Step 8: Run tests and build**

Run: `node --test test/pages-deployment.test.mjs test/entry-domain.test.mjs`

Expected: all focused tests PASS.

Run: `npm run build`

Expected: build exits 0 and produces `dist/index.html`, `dist/quiz.html`, `dist/teacher.html`.

- [ ] **Step 9: Commit homepage and entries**

```bash
git add index.html quiz.html vite.config.js src/HomeApp.jsx src/home-main.jsx test/pages-deployment.test.mjs
git commit -m "Add role entry homepage"
```

---

### Task 3: 返回首頁與入口說明

**Files:**
- Create: `src/HomeLink.jsx`
- Modify: `src/App.jsx`
- Modify: `src/TeacherApp.jsx`
- Modify: `test/pages-deployment.test.mjs`

**Interfaces:**
- Consumes: `getTeacherEntryDescription(entry)` from Task 1 and `import.meta.env.BASE_URL`。
- Produces: shared `HomeLink({ className })` component and entry-aware signed-out teacher copy。

- [ ] **Step 1: Write failing source-contract tests**

在 `test/pages-deployment.test.mjs` 新增：

```js
test("quiz and teacher pages expose the shared home link", async () => {
  const [quizSource, teacherSource] = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/TeacherApp.jsx", import.meta.url), "utf8"),
  ]);

  assert.match(quizSource, /import HomeLink from "\.\/HomeLink\.jsx"/);
  assert.match(teacherSource, /import HomeLink from "\.\/HomeLink\.jsx"/);
});

test("teacher page derives signed-out copy from the entry parameter", async () => {
  const teacherSource = await readFile(
    new URL("../src/TeacherApp.jsx", import.meta.url),
    "utf8",
  );

  assert.match(teacherSource, /getTeacherEntryDescription/);
  assert.match(teacherSource, /URLSearchParams\(window\.location\.search\)/);
});
```

- [ ] **Step 2: Run the source-contract tests and verify RED**

Run: `node --test test/pages-deployment.test.mjs`

Expected: FAIL because `HomeLink` and entry-aware copy are not wired.

- [ ] **Step 3: Implement the shared home link**

建立 `src/HomeLink.jsx`：

```jsx
export default function HomeLink({ className = "" }) {
  return (
    <a
      className={`inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:text-emerald-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${className}`}
      href={import.meta.env.BASE_URL}
    >
      <span aria-hidden="true">←</span>
      返回首頁
    </a>
  );
}
```

- [ ] **Step 4: Add `HomeLink` to the quiz page**

在 `src/App.jsx` 匯入 `HomeLink`，並在所有測驗 view 共用的最外層頁首區域加入：

```jsx
<HomeLink className="mb-5" />
```

連結不可清除或提交測驗狀態；它只執行一般頁面導覽。

- [ ] **Step 5: Add entry-aware copy and `HomeLink` to the teacher page**

在 `src/TeacherApp.jsx`：

```jsx
import HomeLink from "./HomeLink.jsx";
import { getTeacherEntryDescription } from "./entryDomain.js";
```

在 component state 宣告之前衍生一次：

```js
const entry = new URLSearchParams(window.location.search).get("entry");
const signedOutDescription = getTeacherEntryDescription(entry);
```

將頁首加入 `<HomeLink className="mb-4" />`，並把 signed-out 區塊目前固定的說明改為：

```jsx
<p className="mt-2 text-slate-600">{signedOutDescription}</p>
```

不得用 `entry` 修改 `role` state、`portalState`、Firebase 查詢或管理員判斷。

- [ ] **Step 6: Run focused, full, lint, and build verification**

Run: `node --test test/pages-deployment.test.mjs test/entry-domain.test.mjs`

Expected: all focused tests PASS.

Run: `npm test`

Expected: all non-emulator tests PASS.

Run: `npm run lint`

Expected: exit 0.

Run: `npm run build`

Expected: exit 0 and all three HTML files exist under `dist/`.

- [ ] **Step 7: Commit navigation integration**

```bash
git add src/HomeLink.jsx src/App.jsx src/TeacherApp.jsx test/pages-deployment.test.mjs
git commit -m "Link role pages to homepage"
```

---

### Task 4: 完整驗證、推送與公開站驗收

**Files:**
- Verify: `dist/index.html`
- Verify: `dist/quiz.html`
- Verify: `dist/teacher.html`
- Verify: public GitHub Pages URLs

**Interfaces:**
- Consumes: all prior tasks。
- Produces: deployed and browser-verified role entry homepage revision。

- [ ] **Step 1: Run the complete local verification suite**

Run each command independently:

```bash
npm test
npm run lint
npm run build
git diff --check
```

Expected: tests have zero failures, lint/build exit 0, and `git diff --check` prints nothing. General `npm test` may report the seven existing emulator-only Rules tests as skipped; this feature does not alter Rules.

- [ ] **Step 2: Verify production build files and copy**

Run:

```bash
test -f dist/index.html
test -f dist/quiz.html
test -f dist/teacher.html
rg -n "學生開始測驗|教師／管理員|家長查看紀錄" dist/assets/*.js
rg -n "返回首頁" dist/assets/*.js
```

Expected: all file checks exit 0 and built assets contain all required labels.

- [ ] **Step 3: Push the verified `main` revision**

Before pushing, confirm `git status -sb` is clean apart from ignored/generated local brainstorming artifacts. Push with:

```bash
git push origin main
```

Expected: push succeeds without force and `main` matches `origin/main`.

- [ ] **Step 4: Require GitHub Pages workflow success**

Check the workflow run whose `head_sha` equals the pushed commit. Require `status: completed` and `conclusion: success`; if it fails, inspect the failed job before retrying.

- [ ] **Step 5: Browser-verify the public flow with cache-busting URLs**

Verify:

1. `/junior-high-school-test/?v=<commit>` shows three horizontal entries in the approved order.
2. Student entry opens `/quiz.html` and displays code/name fields.
3. Teacher entry opens `teacher.html?entry=teacher` and shows teacher-specific signed-out copy before login.
4. Parent entry opens `teacher.html?entry=parent` and shows parent-specific signed-out copy before login.
5. Google login still produces the Firebase-authorized portal state; the URL does not grant a role.
6. Both `quiz.html` and `teacher.html` return-home links reopen the landing page.
7. Direct `teacher.html` without `entry` displays the fallback description and remains usable.

- [ ] **Step 6: Record final evidence**

Report the commit SHA, test counts, lint/build results, Actions run URL/status, public URLs, and any browser checks that could not be completed. Do not describe an unverified login state or Pages run as successful.

