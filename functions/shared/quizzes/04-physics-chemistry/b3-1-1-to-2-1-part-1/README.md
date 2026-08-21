# 理化 壹（part-1）— 後端定義（骨架，待來源）

> ⛔ **內容尚未填入。** 需先取得使用者提供的理化原始檔，逐題擷取題目、選項、正解與解析後才能建立 `part1Definition.js`。**不得虛構任何題目、答案或解析。**

## 規格

- `quizId`：`physics-chemistry-b3-1-1-to-2-1-part-1`
- `version`：`1`
- `kind`：`multiple-choice`
- `subject`：`PhysicsChemistry`
- 題數 × 配分：**40 題 × 2.5 分 = 100**

## 要建立的檔案

- `part1Definition.js`：完整題庫（含 `correct` 與 `explanation`），只存在後端。

## Schema（沿用 english-review-2 的多選題契約）

```js
// part1Definition.js
const QUIZ_ID = "physics-chemistry-b3-1-1-to-2-1-part-1";

function question(number, text, options, correctIndex, explanation, extra = {}) {
  const id = `pc1-q${String(number).padStart(2, "0")}`;
  return {
    id,
    number,
    section: 1,
    points: 2.5,            // 壹：每題 2.5 分
    text,
    explanation,           // 只在後端；前端 content 必須移除
    ...extra,              // 例如 { figureId: "pc1-q05-circuit" }
    options: options.map((optionText, index) => ({
      id: `${id}-o${index + 1}`,
      text: optionText,
      correct: index === correctIndex,   // 只在後端
    })),
  };
}

const questions = [
  // question(1, "題幹…", ["(A) …", "(B) …", "(C) …", "(D) …"], 0, "解析：…"),
  // …共 40 題
];

export const PHYSICS_CHEMISTRY_PART_1 = {
  id: QUIZ_ID,
  version: 1,
  kind: "multiple-choice",
  orderingPolicy: "canonical",   // 或沿用既有隨機化機制
  subject: "PhysicsChemistry",
  title: "理化 第三冊 1-1～2-1 壹",
  catalogDescription: "…（依實際單元填寫）",
  questions,
};
```

註冊：於 `functions/shared/quizRegistry.js` 的 `CURRENT_QUIZ_DEFINITIONS` 加入 `PHYSICS_CHEMISTRY_PART_1`。
