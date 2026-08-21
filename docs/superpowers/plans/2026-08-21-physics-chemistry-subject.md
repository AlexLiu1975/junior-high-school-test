# 理化科目與科目資料夾重整實作計畫

> **For agentic workers:** 依 `docs/superpowers/specs/2026-08-21-physics-chemistry-subject-design.md` 實作。步驟以 `- [ ]` 追蹤。
>
> **狀態（2026-08-21）：** Tasks 1–7 已實作完成。理化壹（40 題）、貳（25 題）已由使用者提供的原始檔擷取並建立，前後端接線、素材抽出、單元測試與 lint／build 全綠。安全規則＋Functions emulator 整合測試需在有網路與 Java 21 的 CI 執行後，再由擁有人確認部署。

**Goal:** 將前後端測驗依科目整理成一致的資料夾結構、選單改為科目分組，並新增第四科目「理化」的兩份多選題試卷（壹 40×2.5、貳 25×4），沿用既有登入、跨裝置進度、重複提交保護與教師紀錄。

**Architecture:** 沿用 `english-review-2` 的多選題資料契約與 `quizRegistry` 可信計分邊界。前端只負責作答狀態與渲染，答案與解析永遠只在 Functions。

**Tech Stack:** React 19、Vite 8、Firebase JS SDK 12、Firebase Functions Gen 2 (Node 22)、Cloud Firestore、Node test runner、Emulators、oxlint。

## Global Constraints

- 既有 `quizId`／`attemptId`／進度鍵不變：`biology-cell-microscope-1`、`english-review-2`、`periodic-table`。
- 理化兩份試卷的穩定 ID：`physics-chemistry-b3-1-1-to-2-1-part-1`、`physics-chemistry-b3-1-1-to-2-1-part-2`，subject 皆為 `PhysicsChemistry`。
- 前端 content 檔與 bundle 不得含任何 `correct`／答案／解析。
- 來源 HTML 僅作題目擷取參考，不 iframe 嵌入、不執行來源內嵌 JavaScript。
- 部署需專案擁有人另行核准（Spark 方案下正式 Functions 部署仍受阻）。

---

### Task 1: 前後端科目資料夾重整　✅ 已完成

**Files:**
- Move: `src/{BiologyQuiz.jsx,biologyQuiz*.js,biologyResultPresentation.js,biologySubmissionStatus.js}` → `src/quizzes/01-biology/`
- Move: `src/{EnglishReview2Quiz.jsx,englishReview2*.js,EnglishQuestionFigure.jsx}` → `src/quizzes/02-english/`
- Move: `src/{PeriodicTableQuiz.jsx,periodicTableAdapter.js,periodicTableDomain.js}` → `src/quizzes/03-periodic-table/`
- Move: `functions/shared/{biologyDefinition,englishReview2Definition,englishReview2Scoring,periodicTableDefinition,periodicTableSubmission}.js` → `functions/shared/quizzes/NN-*/`
- 共用基礎設施（catalog、firebase、student sync、`quizRegistry`、`multipleChoiceSubmission`、`reviewPayload`）留在原位。

**Done when:** 所有相對 import 重寫、`quizId`／進度鍵不變、`npm test`／lint／build 與重構前一致（226 tests、210 pass、16 skipped）。

### Task 2: 選單改為科目分組　✅ 已完成

**Files:** `src/QuizCatalog.jsx`

**Done when:** 選單依 `subject` 分組顯示生物／英語／元素週期表／理化四群；catalog 物件結構、ID、路由不變；`test/quiz-catalog.test.mjs` 通過。

### Task 3: 取得理化來源檔並擷取題庫　⛔ 阻擋中（等待來源）

**Files:** Source reference: 使用者提供的原始理化遊戲化 HTML（**尚未取得**）。

**Steps:**
- [ ] 取得含 65 題（壹 40＋貳 25）之題目、選項、圖片、答案與解析的原始檔。
- [ ] 逐題核對題號、選項、正解與解析；圖片抽出為每份試卷自己的素材檔。
- [ ] **不得虛構任何題目、選項、答案或解析。**

### Task 4: 建立壹（part-1）後端定義與前端 content

**Files:**
- Create: `functions/shared/quizzes/04-physics-chemistry/b3-1-1-to-2-1-part-1/part1Definition.js`
- Create: `src/quizzes/04-physics-chemistry/b3-1-1-to-2-1-part-1/part1Content.js`
- Create: `src/quizzes/04-physics-chemistry/b3-1-1-to-2-1-part-1/part1Adapter.js`
- Create: `src/quizzes/04-physics-chemistry/b3-1-1-to-2-1-part-1/Part1Quiz.jsx`
- Create tests：definition、adapter、answer-key-boundary。

**Done when:** 40 題、每題 2.5 分、總分 100；content 無答案／解析；adapter renderResult score 邊界 0–100。

### Task 5: 建立貳（part-2）後端定義與前端 content

**Files:** 同 Task 4，改為 `b3-1-1-to-2-1-part-2` 與 `part2*`。

**Done when:** 25 題、每題 4 分、總分 100；其餘同 Task 4。

### Task 6: 註冊理化試卷並接上選單／路由

**Files:** `functions/shared/quizRegistry.js`、`src/quizCatalogData.js`、`src/main.jsx`

**Done when:** 兩份試卷加入 `CURRENT_QUIZ_DEFINITIONS` 與前端 catalog、lazy route；選單理化群組出現兩份試卷；`quiz-registry` 與 `quiz-catalog` 測試更新且通過。

### Task 7: 全套驗證

**Done when:** `npm run verify`（root＋functions 單元測試、emulator 整合與 Rules 測試、lint、build）全綠；再由擁有人確認部署。
