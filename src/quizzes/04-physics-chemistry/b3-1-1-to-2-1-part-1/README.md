# 理化 壹（part-1）— 前端（骨架，待來源）

> ⛔ **內容尚未填入。** content 必須由後端定義去除答案後產生，**不得虛構**。

## 要建立的檔案

- `part1Content.js`：與後端 definition 同結構，但**移除** `correct`、`explanation` 及任何答案。僅保留題號、題幹、選項文字與 `figureId`。
- `part1Adapter.js`：沿用 `src/quizzes/02-english/englishReview2Adapter.js` 介面（createAttempt／restoreAttempt／serializeProgress／buildSubmission／getUnansweredCount／renderResult；score 邊界 0–100）。
- `Part1Quiz.jsx`：整張多選題頁面，沿用平台既有介面，不含怪物／音效／連擊。
- `assets/`：本試卷抽出的圖片素材；前端以 `figureId` 對應的圖形元件渲染（參見 `src/quizzes/02-english/EnglishQuestionFigure.jsx`）。

## 接線

- `src/quizCatalogData.js`：加入本試卷的 catalog 中繼資料（id、version、kind、subject: `PhysicsChemistry`、title、catalogDescription）。
- `src/main.jsx`：`quizModules` 加入 `'physics-chemistry-b3-1-1-to-2-1-part-1': () => import('./quizzes/04-physics-chemistry/b3-1-1-to-2-1-part-1/Part1Quiz.jsx')`。

## 邊界測試

沿用 `test/answer-key-boundary.test.mjs` 模式，斷言 `part1Content.js` 不含 `correct`／`answers`／`explanation`。
