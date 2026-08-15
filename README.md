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
- 預算警示只會通知，不是硬性費用上限。啟用 Blaze 前請由專案擁有人選定可接受的小額月預算；測試期可考慮從每月 NT$100（或等值幣別）開始，並設定 50%、90%、100% 通知門檻。這只是起始提醒建議，不代表現有 Billing 狀態或費用上限，仍須持續監看用量。

## Firebase 前置設定

專案 ID：`junior-high-school-test`

1. Authentication 啟用「匿名」與「Google」，Authorized domains 加入 `alexliu1975.github.io`。
2. 建立位於 `nam5` 的 Firestore；Callable Functions 與其配對使用 `us-central1`。
3. Callable Functions 固定使用 `us-central1`，四個名稱為：
   - `loadStudentProgress`
   - `saveStudentProgress`
   - `submitQuizAttempt`
   - `removeOrDeactivateStudent`
4. 四個 Callable 都設定 `maxInstances: 3`、逾時 30 秒、記憶體 256 MiB。
5. Spark 方案目前仍阻擋正式 Functions 部署；需升級至 Blaze 前，先取得明確核准、確認 Billing 已連結，並由擁有人依可承擔金額建立低額月預算警示（測試期可考慮 NT$100 或等值幣別、50%／90%／100% 通知）。警示不會自動停止服務，也不是硬性費用上限。
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

正式部署前由操作人員再次確認：專案 ID、Firestore `nam5`、與其配對的 `us-central1`、Blaze/Billing、四個 Callable、`maxInstances: 3`、Rules/indexes diff 與預算警示。Spark 方案下正式 Functions 部署仍遭阻擋；未取得明確升級與部署核准前，不要執行這些寫入操作。確認後才分別部署 Functions／Rules／indexes，再發布已審查的分支並執行三試卷公開 E2E。

## 守護時間（家長手機時間管理）

本 repo 另外收錄一套獨立的家長管制系統：家長在網頁後台設定小孩可用手機的時段與每日
額度，時間一到小孩手機自動鎖定，並可遠端一鍵鎖定、查看使用明細、審核小孩的延長申請。
支援 iOS 與 Android。

- 架構、規則、部署與雙平台限制說明：[`guardian/README.md`](guardian/README.md)
- 小孩端 App（Expo）：[`mobile/README.md`](mobile/README.md)
- 家長後台頁面：`guardian.html`（隨 `npm run build` 一併輸出）

不需要 Firebase 設定即可預覽：`npx vite preview` 後開啟
`/junior-high-school-test/guardian.html?demo=1`，示範模式會在瀏覽器內執行同一套後端邏輯。

規則引擎與服務層測試：`node --test "guardian/test/*.test.mjs"`
