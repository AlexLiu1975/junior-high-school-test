# 國中測驗與紀錄系統

這是具備學生專屬代碼、跨裝置雲端進度與教師／家長紀錄頁的三試卷測驗網站。

## 網站入口與試卷

- `/`：首頁，選擇「開始測驗」或「教師（家長）紀錄」。
- `/quiz.html`：學生試卷選單。學生選擇試卷後，以「專屬代碼＋學生姓名」進入。
- `/teacher.html`：教師、家長與管理員的申請、學生與紀錄頁；頁面標示 `noindex`。

目前試卷：

1. 生物「細胞與顯微鏡」：20 題、每次重新排列題目與選項；結果為百分比、答對／答錯題數與錯題。
2. 英語「第 2 回複習考」：40 題、固定題序；結果為加權百分比、答對／答錯題數與錯題。
3. 化學元素週期表：完成 118 個元素配置；結果為完成數、錯誤嘗試次數與作答時間。這些數字是學習資訊，不是百分制成績。

每張試卷的進度以學生身分保存在雲端，可由另一個匿名登入的瀏覽器繼續。每個完成的 `attemptId` 只產生一筆公開結果與一筆管理員私有紀錄；重送同一筆不會重複新增。

## 角色與資料範圍

### 學生

家長申請並經管理員核准後，取得 `YYYYMMDD-NNN` 格式的專屬代碼。學生只需要代碼及核准時的姓名，不需要建立個人帳號；瀏覽器在背景使用 Firebase 匿名登入。

### 教師與家長

使用已驗證的 Google 帳號登入 `/teacher.html` 並申請權限。教師可查看全部公開測驗紀錄；家長只能查看已核准對應學生的資料。教師與家長都不能讀取 IP 紀錄。

### 管理員

唯一初始管理員是 `beyle931224@gmail.com`，必須以已驗證的 Google 提供者登入。管理員可核准申請、查看全部學生與遮罩 IP，以及執行安全刪除：

- 學生沒有任何測驗紀錄：刪除學生、登入對照、所有管理員連結、家長連結與草稿進度。
- 學生已有任一試卷紀錄：只停用登入並清除未完成作答，永久保留公開結果與私有稽核紀錄。

## 隱私與安全

- GitHub Pages 是公開網站；請勿輸入電話、地址、學號或其他非必要個資。
- 伺服器只保存遮罩 IP：IPv4 隱藏最後一段、IPv6 只留前綴；無法判定時保存「無法判定」。完整 IP 不應寫入 Firestore。
- 答案、計分與寫入由 Callable Functions 驗證；Firestore Rules 禁止學生直接寫入進度與成績。
- Firebase Web 設定值不是服務帳戶金鑰；不得把服務帳戶 JSON、私鑰或存取權杖放入 `.env`、GitHub Variables 或倉庫。
- 預算警示只會通知，不是硬性費用上限。啟用 Blaze 前請另外設定低額預算警示並持續監看用量。

## Firebase 前置設定

專案 ID：`junior-high-school-test`

1. Authentication 啟用「匿名」與「Google」，Authorized domains 加入 `alexliu1975.github.io`。
2. 建立 Firestore，確認資料庫位置與 Functions 區域相容。
3. Callable Functions 固定使用 `asia-east1`，四個名稱為：
   - `loadStudentProgress`
   - `saveStudentProgress`
   - `submitQuizAttempt`
   - `removeOrDeactivateStudent`
4. 四個 Callable 都設定 `maxInstances: 3`、逾時 30 秒、記憶體 256 MiB。
5. 部署 Functions 通常必須使用 Blaze 計費方案；先確認 Billing 已連結並建立低額預算警示。警示不會自動停止服務。
6. Functions、Rules 與 indexes 是人工部署門檻；GitHub Actions 只會在全部驗證通過後自動發布 Pages，不會自動部署後端。

本機 `.env` 與 GitHub Repository Variables 使用：

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
```

## 本機執行與完整驗證

需要 Node.js 22、Java 21 與 Firebase CLI：

```bash
cp .env.example .env
npm ci
npm --prefix functions ci
npm run dev
```

完整部署前門檻：

```bash
npm run verify
```

`verify` 依序執行根目錄單元測試、Functions 單元測試、Auth＋Firestore＋Functions combined emulator 整合與 Rules 測試、lint 及 production build。`npm test` 在沒有 emulator 時會略過 Rules 案例，因此不能單獨代表授權測試通過。

Emulator 固定連接埠：Auth `9099`、Firestore `8080`、Functions `5001`。若本機沒有 Java，請安裝／暫時使用 Java 21，或由具有 Java 21 的 GitHub Actions 執行同一個 `npm run test:emulators`；不可把 skipped 當成通過。

## 資料結構

- `studentEntries/{code}/names/{exactName}`：學生登入核對。
- `students/{studentId}`：核准學生、代碼與啟用狀態。
- `studentProgress/{studentId}/quizzes/{quizId}`：每張試卷的版本化草稿與修訂號。
- `quizAttempts/{attemptId}`：不可修改的公開測驗結果。
- `attemptPrivate/{attemptId}`：只有管理員可讀的遮罩 IP 與建立時間。
- `accessRequests/{uid}`、`viewerAccess/{uid}`：教師／家長申請與核准範圍。
- `adminStudentLinks/{adminUid}/students/{studentId}`：管理員建立學生的連結。
- `dailyCounters/{YYYYMMDD}`：每日流水號；不可重設或回收。

## 人工部署檢核

正式部署前由操作人員再次確認：專案 ID、Firestore location、Blaze/Billing、`asia-east1` 可用性、四個 Callable、`maxInstances: 3`、Rules/indexes diff 與預算警示。確認後才分別部署 Functions／Rules／indexes，再發布已審查的分支並執行三試卷公開 E2E。不要在未取得明確部署核准前執行這些寫入操作。
