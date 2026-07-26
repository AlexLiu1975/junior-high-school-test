# 國中生物測驗與紀錄系統

20 題「細胞與顯微鏡」測驗網站。系統保留每一次作答，並提供教師／家長紀錄頁。

## 使用流程

### 學生

1. 家長申請並經管理員核准後，取得格式為 `YYYYMMDD-NNN` 的學生專屬代碼。
2. 學生在測驗首頁輸入「專屬代碼＋學生姓名」。
3. 每次開始測驗時，題目與各題選項都會重新隨機排列；同一次測驗中順序保持固定。
4. 完成測驗後，每次成績會獨立保存；個人錯題複習進度仍以匿名帳號保存。

### 教師與家長

入口：`/teacher.html`

1. 使用 Google 帳號登入。
2. 首次使用時申請「教師」或「家長」權限；家長需填寫指定學生姓名。
3. 管理員核准後，教師可查看全部紀錄；家長只能查看已核准學生的紀錄與專屬代碼。

### 管理員

唯一初始管理員帳號是 `beyle931224@gmail.com`，且 Google 電子郵件必須已驗證。管理員可在紀錄頁核准或拒絕申請。核准家長時，系統會以台北日期與當日流水號自動建立學生代碼。

> GitHub Pages 是公開網站。請勿在學生姓名以外存放電話、地址、學號或其他敏感個資。真正的資料存取邊界由 `firestore.rules` 執行，不依賴前端畫面隱藏。

## Firebase 設定

專案 ID：`junior-high-school-test`

1. Authentication → Sign-in method：同時啟用「匿名」與「Google」。
2. Google 登入方式需選擇專案支援電子郵件。
3. Authentication → Settings → Authorized domains：保留 `alexliu1975.github.io`。
4. 建立 Firestore Database。
5. 部署本倉庫的安全規則：

   ```bash
   firebase login
   firebase deploy --only firestore:rules --project junior-high-school-test
   ```

6. 本機使用 `.env`；GitHub Pages 使用 Repository Variables：

   ```text
   VITE_FIREBASE_API_KEY
   VITE_FIREBASE_AUTH_DOMAIN
   VITE_FIREBASE_PROJECT_ID
   VITE_FIREBASE_STORAGE_BUCKET
   VITE_FIREBASE_MESSAGING_SENDER_ID
   VITE_FIREBASE_APP_ID
   ```

## 本機執行

```bash
cp .env.example .env
npm install
npm run dev
```

學生頁預設為 `http://localhost:5173/`，教師／家長頁為 `http://localhost:5173/teacher.html`。

## 驗證

```bash
npm test
npm run test:rules
npm run lint
npm run build
```

`test:rules` 需要 Java 21 或相容版本，會啟動本機 Firestore Emulator。一般 `npm test` 在未啟動模擬器時會跳過 Rules 專用案例；完整授權驗證請以 `npm run test:rules` 為準。

## 主要資料

- `studentEntries/{code}/names/{exactName}`：學生登入核對。
- `students/{studentId}`：核准的學生與代碼。
- `quizAttempts/{attemptId}`：每一次不可修改的測驗紀錄。
- `accessRequests/{uid}`：教師／家長申請。
- `viewerAccess/{uid}`：核准角色與家長可查看的學生範圍。
- `dailyCounters/{YYYYMMDD}`：每日代碼流水號；不可重設，以免代碼重複。

## 專案結構

```text
src/App.jsx              學生測驗頁
src/TeacherApp.jsx       教師、家長與管理員紀錄頁
src/firebase.js          學生匿名登入、進度與作答寫入
src/teacherFirebase.js   Google 登入、申請、審核與紀錄查詢
firestore.rules          正式資料授權邊界
test/                    單元、建置與 Firestore Rules 測試
```
