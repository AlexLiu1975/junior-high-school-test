# 三角色入口首頁設計

## 目標

為公開 GitHub Pages 網站新增入口首頁，讓學生、教師／管理員與家長不必記住不同網址，也能清楚進入正確功能。首頁只負責導覽，不讀取 Firebase、不登入，也不顯示任何學生或測驗資料。

## 本次範圍

首頁提供三個入口：

1. 學生開始測驗
2. 教師／管理員
3. 家長查看紀錄

本次不加入公告、公告管理、註冊、首頁後台編輯或其他新功能。這些功能待首頁上線驗證後再分別規劃。

## 網址與導覽

- `/junior-high-school-test/`：新的入口首頁。
- `/junior-high-school-test/quiz.html`：目前的學生測驗功能。
- `/junior-high-school-test/teacher.html?entry=teacher`：教師／管理員入口。
- `/junior-high-school-test/teacher.html?entry=parent`：家長入口。
- 既有 `/junior-high-school-test/teacher.html` 網址維持可用，並顯示通用登入說明。
- `quiz.html` 與 `teacher.html` 都提供「返回首頁」連結。

教師與家長的 `entry` 查詢參數只控制登入前的說明文字，不代表權限。登入後的角色、資料範圍與管理員能力仍完全由 Firebase Authentication、Firestore 資料及 Security Rules 決定。未知或缺少 `entry` 值時，教師頁使用目前的通用說明。

## 首頁視覺

首頁沿用現有網站的綠色、深藍與米白色系，顯示「國中自然科／測驗學習平台」標題及三個由上而下排列的整排橫條：

1. 綠色主橫條「學生開始測驗」，說明「使用專屬代碼＋學生姓名進入」。
2. 白色橫條「教師／管理員」，說明「審核申請、建立學生、查看全部紀錄」。
3. 白色橫條「家長查看紀錄」，說明「使用 Google 帳號查看已指定學生」。

每個橫條都包含標題、簡短說明與箭頭，整條均可點擊。桌面與手機保持相同閱讀順序，只調整容器寬度、字級與留白。所有入口必須可用鍵盤操作，並提供清楚的 hover 與 focus 樣式。

## 程式邊界

- 新增獨立首頁元件與入口檔案，只負責呈現三個靜態連結。
- 將目前學生測驗的 HTML 入口移至 `quiz.html`，繼續使用既有測驗 React 元件與 Firebase 流程。
- 教師頁只新增入口說明文字的純資料衍生與「返回首頁」連結，不改變登入、申請、管理員模式或資料查詢流程。
- 不修改 Firestore collection、文件格式或 Security Rules。
- Vite production build 必須產出 `index.html`、`quiz.html` 與 `teacher.html`。

## 錯誤與相容性

- 首頁沒有遠端資料依賴，因此不需要載入或錯誤狀態。
- 教師頁若收到未知的 `entry` 值，退回通用登入說明，不顯示錯誤，也不改變權限。
- 現有學生代碼、姓名登入、測驗題目隨機化、作答及紀錄儲存行為維持不變。
- 既有直接開啟 `teacher.html` 的書籤與連結繼續可用。

## 驗證

自動驗證至少涵蓋：

- 首頁三個入口的標題、說明與目標網址。
- 教師、家長、未知及缺少 `entry` 時的登入說明衍生。
- production build 同時產出 `index.html`、`quiz.html`、`teacher.html`。
- 既有測驗、Firebase 設定、教師登入與權限測試不退步。
- lint、production build 與 diff check 通過。

公開站上線後驗證：

1. 首頁三個橫條入口皆可進入正確頁面。
2. `quiz.html` 可用既有學生代碼與姓名開始測驗。
3. 教師與家長入口顯示對應說明，Google 登入仍由實際權限決定頁面內容。
4. `quiz.html` 與 `teacher.html` 的「返回首頁」可正常使用。
5. 直接開啟不含 `entry` 的舊 `teacher.html` 仍可登入。

