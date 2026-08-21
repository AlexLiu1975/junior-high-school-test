# 理化 貳（part-2）— 後端定義（骨架，待來源）

> ⛔ **內容尚未填入。** 需先取得使用者提供的理化原始檔，逐題擷取後才能建立 `part2Definition.js`。**不得虛構任何題目、答案或解析。**

## 規格

- `quizId`：`physics-chemistry-b3-1-1-to-2-1-part-2`
- `version`：`1`
- `kind`：`multiple-choice`
- `subject`：`PhysicsChemistry`
- 題數 × 配分：**25 題 × 4 分 = 100**

## 要建立的檔案

- `part2Definition.js`：完整題庫（含 `correct` 與 `explanation`），只存在後端。

## Schema

與 `../b3-1-1-to-2-1-part-1/README.md` 相同，差異為：

- id 前綴 `pc2-q…`
- `points: 4`（貳：每題 4 分，共 25 題）
- 匯出常數命名 `PHYSICS_CHEMISTRY_PART_2`、`title: "理化 第三冊 1-1～2-1 貳"`

註冊：於 `functions/shared/quizRegistry.js` 的 `CURRENT_QUIZ_DEFINITIONS` 加入 `PHYSICS_CHEMISTRY_PART_2`。
