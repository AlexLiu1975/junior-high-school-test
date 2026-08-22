# 理化科目與科目資料夾重整設計

## 目標

在現有測驗平台新增第四個科目「理化」，並將前後端測驗程式依科目重新整理成一致的資料夾結構，讓題庫最容易尋找、後端仍維持可信計分。理化提供兩份試卷（壹、貳），沿用現有平台的登入、跨裝置進度、重複提交保護與教師／家長／管理員紀錄。

本設計延續 `2026-08-08-multi-quiz-catalog-design.md` 與 `2026-08-02-cloud-progress-safe-delete-audit-design.md`。原有的 Functions 信任邊界、安全刪除、遮罩 IP、離線暫存與角色權限全數沿用；本設計只新增一個科目與其兩份多選題試卷，並調整程式碼的資料夾組織與選單分組。

## 已確認決策

- 前端與後端建立相同的科目資料夾，選單依科目分組：
  - `src/quizzes/01-biology`、`02-english`、`03-periodic-table`、`04-physics-chemistry`
  - `functions/shared/quizzes/01-biology`、`02-english`、`03-periodic-table`、`04-physics-chemistry`
- 理化提供兩份試卷，各自資料夾為 `b3-1-1-to-2-1-part-1`（壹）與 `b3-1-1-to-2-1-part-2`（貳）。
- 壹：40 題，每題 2.5 分，總分 100。
- 貳：25 題，每題 4 分，總分 100。
- 保留原題目、圖片、答案與解析；圖片抽出成每份試卷自己的素材檔，避免巨大 HTML 與外部連結。
- 題序與選項採 canonical（固定原順序，不隨機）：原試卷即固定題序與固定 (A)(B)(C)(D)，且解析內文會引用選項字母，故保持原順序以維持字母一致；跨裝置進度可完整還原。
- 答案與解析只保留在後端 Functions；瀏覽器內的 content 檔不得包含任何 `correct` 旗標、答案或解析。提交成功後才由後端回傳全部題目的作答結果與解析。
- 保留原始「電玩闖關版」的測驗玩法與外觀：怪物、音效、連擊、分數／進度 HUD、粒子與結算動畫、討伐等級。採**即時判定**：作答當下就打怪、連擊、顯示對錯與解析。為維持答案不外洩，每作答一題（或回復進度時批次）呼叫新的唯讀 Callable `gradeQuizAnswers` 由後端判定，只回傳「該題」的對錯、正解與解析；答案金鑰永不進瀏覽器。全部作答後仍由 `submitQuizAttempt` 記錄不可竄改的權威成績與教師紀錄。
- 新增第 5 個 Callable `gradeQuizAnswers`（唯讀、不寫入、`us-central1`、`maxInstances:3`、逾時 30 秒、記憶體 256 MiB）。它會驗證學生身分與啟用狀態，且不記錄任何資料；正式部署需與其他 Functions 一併經擁有人核准（Spark 方案下正式 Functions 部署仍受阻）。即時判定屬互動需求，會使 Functions 呼叫量隨作答數上升，屬預期成本。
- 舊測驗網址、舊成績與進度識別碼保持相容：既有三份試卷的 `quizId`、`attemptId` 與進度鍵一律不變，本次僅移動檔案位置與新增理化試卷。

## 穩定識別碼（一經核准即凍結）

| 試卷 | quizId | version | kind | subject | 題數 × 配分 |
| --- | --- | --- | --- | --- | --- |
| 壹 | `physics-chemistry-b3-1-1-to-2-1-part-1` | 1 | `multiple-choice` | `PhysicsChemistry` | 40 × 2.5 = 100 |
| 貳 | `physics-chemistry-b3-1-1-to-2-1-part-2` | 1 | `multiple-choice` | `PhysicsChemistry` | 25 × 4 = 100 |

- 選單分組以 `subject` 推導；`PhysicsChemistry` 顯示為「理化」，排在生物、英語、元素週期表之後。
- `Science`（元素週期表）與 `PhysicsChemistry`（理化）為兩個獨立的選單群組，對應 `03-periodic-table` 與 `04-physics-chemistry` 兩個資料夾。

## 來源檔案（尚待提供）

- 理化題目、圖片、答案與解析來源：**使用者提供的原始遊戲化 HTML（尚未取得）**。
  - 依既有慣例，來源 HTML 只用來擷取題目、選項、圖片、答案與解析，不以 iframe 嵌入，也不在正式網站執行來源檔中的內嵌 JavaScript。
  - 目前 `/Users/alex/Downloads/junior-high-school-test/` 內僅有生物、英語、元素週期表與歷史等來源檔，**沒有**理化來源檔。實作 content／definition 前必須先取得此檔，且不得虛構任何題目、選項、答案或解析。

## 資料契約與計分

兩份試卷皆為 `multiple-choice`，沿用英語第 2 回複習考（`english-review-2`）的資料契約：

- 後端 `*Definition.js`：完整題目物件，含每個選項的 `correct` 布林值、每題 `points`、以及 `explanation`。
  - 壹每題 `points: 2.5`；貳每題 `points: 4`。總分皆為 100。
- 前端 `*Content.js`：與後端同結構但**移除** `correct`、`explanation` 與任何答案資訊，僅保留題號、題幹、選項文字、圖片參照。
- Adapter：沿用 `englishReview2Adapter` 的 createAttempt／restoreAttempt／serializeProgress／buildSubmission／renderResult 介面；`renderResult` 的 `score` 邊界為 0–100。
- 計分、答案比對與解析回傳一律由 Callable Function `submitQuizAttempt` 經 `quizRegistry` 驗證後執行；Firestore Rules 仍禁止學生端直接寫入進度與成績。

## 圖片素材

- 每份試卷的圖片抽出為該試卷資料夾內的素材檔（例如 `assets/` 內的圖片，或以 `figureId` 對應的圖形元件），避免將 base64 巨圖內嵌在單一 HTML 或依賴外部連結。
- 前端以既有的圖形元件模式（參見 `EnglishQuestionFigure.jsx`）依 `figureId` 渲染，圖片本身與題目 content 分離。

## 驗證範圍

- 65 題（壹 40＋貳 25）之題目、選項、圖片、答案與解析完整性。
- 兩份試卷各自計分為 100 分（壹 40×2.5、貳 25×4）。
- 前端 bundle 與 content 檔不得包含任何答案或解析（沿用 `answer-key-boundary` 類型測試）。
- 四個科目選單分組，以及理化兩份試卷的路由（`quiz.html?quiz=...`）。
- 後端可信計分、attemptId 重試不重複、跨裝置雲端進度與教師紀錄。
- 全部單元測試、lint、build 及 Firestore Rules＋Functions emulator 整合測試通過後，才由專案擁有人確認部署（Spark 方案下正式 Functions 部署仍受阻，需先取得升級與部署核准）。
