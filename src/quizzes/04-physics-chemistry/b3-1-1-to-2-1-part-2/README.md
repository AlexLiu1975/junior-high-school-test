# 理化 貳（part-2）— 前端（骨架，待來源）

> ⛔ **內容尚未填入。** content 必須由後端定義去除答案後產生，**不得虛構**。

## 要建立的檔案

與 `../b3-1-1-to-2-1-part-1/README.md` 相同，命名改為 `part2*`：

- `part2Content.js`（25 題、無答案／解析）
- `part2Adapter.js`
- `Part2Quiz.jsx`
- `assets/`（本試卷圖片素材）

## 接線

- `src/quizCatalogData.js`：加入 `physics-chemistry-b3-1-1-to-2-1-part-2`（subject `PhysicsChemistry`）。
- `src/main.jsx`：`quizModules` 加入 `'physics-chemistry-b3-1-1-to-2-1-part-2': () => import('./quizzes/04-physics-chemistry/b3-1-1-to-2-1-part-2/Part2Quiz.jsx')`。

貳為 25 題、每題 4 分、總分 100。
