#!/usr/bin/env bash
# 部署本專案的 Cloud Functions（5 個 Callable）到正式環境。
#
# 說明：
#   - 前端 GitHub Pages 會在 push 到 main 時由 GitHub Actions 自動發布，不在此腳本範圍。
#   - firestore.rules 與 firestore.indexes.json 目前未變動，本腳本「不」部署它們。
#   - 需 Blaze 方案（Spark 會擋正式 Functions 部署）。即時判定會增加 Functions 呼叫量。
#
# 用法：
#   bash scripts/deploy-functions.sh            # 完整流程（含部署前驗證與確認）
#   SKIP_VERIFY=1 bash scripts/deploy-functions.sh   # 略過本機驗證（僅在 CI 已全綠時）
set -euo pipefail

PROJECT_ID="junior-high-school-test"
REGION="us-central1"
SKIP_VERIFY="${SKIP_VERIFY:-0}"

# 選用 Firebase CLI：優先全域安裝，否則用 npx
if command -v firebase >/dev/null 2>&1; then
  FIREBASE=(firebase)
else
  FIREBASE=(npx --yes firebase-tools)
fi

# 切到 repo 根目錄（腳本位於 scripts/）
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "▶ 專案：${PROJECT_ID}（Functions 區域 ${REGION}）"
echo "▶ Firebase CLI：${FIREBASE[*]}"

# 登入檢查
if ! "${FIREBASE[@]}" projects:list >/dev/null 2>&1; then
  echo "✗ 尚未登入 Firebase CLI。請先執行：${FIREBASE[*]} login" >&2
  exit 1
fi

echo "▶ 安裝相依套件…"
npm ci
npm --prefix functions ci

# 部署前驗證
if [ "${SKIP_VERIFY}" = "1" ]; then
  echo "⚠ 已略過 npm run verify（SKIP_VERIFY=1）；請確認 PR 的 CI 已全綠。"
elif java -version >/dev/null 2>&1; then
  # 用實際執行 java -version 判斷（macOS 只有 java 空殼時 command -v 會誤判為有 Java）。
  echo "▶ 執行完整驗證 npm run verify（含 emulator＋Firestore 規則測試）…"
  npm run verify
else
  echo "⚠ 找不到可用的 Java（Java 21），無法在本機跑 emulator／規則測試；改跑單元測試＋lint＋build。"
  echo "  （完整 emulator／規則測試以 GitHub Actions CI 為準）"
  npm test
  npm run test:functions
  npm run lint
  npm run build
fi

# 正式部署確認
echo
echo "即將部署 5 個 Callable Functions 到正式專案 ${PROJECT_ID}："
echo "  loadStudentProgress / saveStudentProgress / submitQuizAttempt / gradeQuizAnswers / removeOrDeactivateStudent"
echo "注意：需 Blaze 方案；即時判定（gradeQuizAnswers）會增加 Functions 呼叫量；rules/indexes 不在此部署。"
read -r -p "確定要部署嗎？輸入 yes 繼續： " CONFIRM
if [ "${CONFIRM}" != "yes" ]; then
  echo "已取消，未部署任何東西。"
  exit 0
fi

echo "▶ 部署 Functions…"
"${FIREBASE[@]}" deploy --only functions --project "${PROJECT_ID}"

echo "▶ 目前已部署的函式："
"${FIREBASE[@]}" functions:list --project "${PROJECT_ID}" || true

echo "✓ 完成。請到正式網站跑四個科目 E2E（生物／英語／元素週期表／理化壹貳），"
echo "  並到 Firebase／GCP 主控台確認 5 個函式都在 ${REGION}、以及 Functions 用量與預算警示。"
