# 學生歷次測驗與教師（家長）紀錄頁設計

日期：2026-07-26  
專案：`AlexLiu1975/junior-high-school-test`

## 目標

讓多人使用同一份測驗。學生開始前必須輸入姓名，每次完成測驗都保留一筆獨立紀錄；教師或家長以 Google 帳號申請權限，經管理員核准後才能查看所有學生的歷次成績。

唯一管理員帳號為 `beyle931224@gmail.com`。

## 使用者角色

### 學生

- 沿用 Firebase 匿名登入，不需要申請帳號。
- 開始測驗前必須輸入姓名。
- 姓名去除前後空白後須為 1 至 40 個字元。
- 可以使用既有的作答、複習排程與清除個人進度功能。
- 完成測驗時新增一筆歷次紀錄。
- 不能讀取教師／家長申請、核准名單或其他學生的歷次紀錄。

### 教師／家長

- 從獨立的教師（家長）紀錄頁使用 Google 帳號登入。
- 第一次登入時可以提出存取申請。
- 申請狀態為 `pending`、`approved` 或 `rejected`。
- 只有 `approved` 帳號能查看所有歷次測驗紀錄。
- 可以依學生姓名搜尋紀錄；預設依提交時間由新到舊排列。
- 不能核准其他帳號。

### 管理員

- 必須以 `beyle931224@gmail.com` 登入。
- 擁有教師／家長的紀錄查看能力。
- 可以查看所有申請，並核准或拒絕申請。
- 管理員資格由 Firestore 安全規則比對已驗證的 Firebase Auth email，不由前端自行判定。

## 頁面與互動

### 學生測驗首頁

- 在「開始測驗」按鈕上方增加「測試人姓名」文字欄位。
- 未輸入有效姓名時，「開始測驗」維持停用，並顯示簡短提示。
- 開始後固定本次姓名；返回首頁重新開始時可以修改。
- 結果頁顯示本次測試人姓名。
- 每次按下完成測驗只建立一筆歷次紀錄，避免 React Strict Mode 或重複操作造成重複寫入。

### 教師（家長）紀錄頁

- 路徑為 `/junior-high-school-test/teacher.html`。
- 未登入：顯示 Google 登入按鈕與資料用途說明。
- 已登入、未申請：顯示「提出申請」。
- `pending`：顯示等待管理員核准。
- `rejected`：顯示未通過，可重新提出申請。
- `approved`：顯示歷次紀錄表與姓名搜尋。
- 管理員：除歷次紀錄外，顯示待審申請與核准／拒絕操作。
- 表格欄位為提交時間、學生姓名、分數、答對題數、答錯題數與測驗名稱。
- 空資料、載入中、登入失敗、權限不足與網路失敗都有明確中文訊息。

## Firebase Authentication

- 學生頁沿用目前的匿名登入。
- 教師頁使用 Google 登入。
- 教師頁建立具獨立名稱的 Firebase App/Auth instance，並使用記憶體持久性，避免覆蓋同一瀏覽器中的學生匿名登入狀態。
- Firebase Authentication 必須啟用 Google 登入方式。
- `alexliu1975.github.io` 必須保留在 Authentication 授權網域。

## Firestore 資料模型

### `quizAttempts/{attemptId}`

每次完成測驗新增一份文件：

```text
quizId: "cell-microscope-quiz1"
quizTitle: "第1回 第1、2單元｜細胞與顯微鏡"
studentUid: Firebase anonymous uid
studentName: string (trimmed, 1..40 characters)
score: integer (0..100)
correctCount: integer (0..20)
wrongCount: integer (0..20)
submittedAt: server timestamp
```

`attemptId` 由 Firestore 自動產生。學生只能建立 `studentUid` 等於自己 UID 且欄位符合上述限制的文件；不能更新或刪除歷次紀錄。

### `accessRequests/{uid}`

```text
uid: Google sign-in uid
email: verified Firebase Auth email
displayName: Google display name
status: "pending" | "approved" | "rejected"
requestedAt: server timestamp
reviewedAt: server timestamp | null
reviewedBy: admin email | null
```

申請人只能讀取自己的申請，並建立／重新提出自己的申請。申請人不能自行把狀態改為 `approved`。管理員可以讀取及審核全部申請。

### `viewerAccess/{uid}`

```text
uid: Google sign-in uid
email: verified Firebase Auth email
approvedAt: server timestamp
approvedBy: "beyle931224@gmail.com"
```

只有管理員可以建立或刪除核准文件。本人可以讀取自己的核准狀態。歷次紀錄的讀取權限以此文件存在，或登入 email 為管理員，作為判斷依據。

### 現有個人進度

`users/{uid}/quizProgress/{quizId}` 維持原結構與本人限定的讀寫規則。姓名與歷次紀錄不改變既有複習排程資料。

## Firestore 安全規則

- 預設拒絕所有未明確允許的讀寫。
- 匿名或 Google 使用者只能讀寫自己的 `quizProgress`。
- 已登入使用者只能新增符合欄位、型別、範圍及本人 UID 限制的 `quizAttempts`。
- 客戶端不能更新或刪除 `quizAttempts`。
- 只有管理員或 `viewerAccess/{uid}` 存在的已核准帳號能讀取 `quizAttempts`。
- 申請人只能管理自己的申請，且不能自行核准。
- 只有管理員能列出申請、變更審核狀態及管理 `viewerAccess`。
- 管理員判定必須同時要求登入 token 的 email 為 `beyle931224@gmail.com` 且 `email_verified == true`。

## 資料流

1. 學生匿名登入並載入自己的複習進度。
2. 學生輸入姓名後開始測驗。
3. 完成時先計算分數與下一次複習資料。
4. 個人複習進度寫入原有文件。
5. 歷次結果以新的自動 ID 寫入 `quizAttempts`。
6. 教師／家長以獨立 Google Auth instance 登入並讀取自己的申請／核准狀態。
7. 已核准帳號查詢 `quizAttempts`；管理員另查詢待審申請。
8. 管理員核准時更新申請狀態並建立對應 `viewerAccess` 文件；拒絕時只更新申請狀態。

## 個資與安全

- 公開頁面不提供全體紀錄讀取能力。
- 前端顯示權限不是安全邊界，所有敏感讀取都必須通過 Firestore 規則。
- 不收集生日、班級、學號或其他非必要欄位。
- 姓名會傳送至 Firebase；學生首頁須顯示用途說明。
- 教師頁不提供公開匯出、分享連結或搜尋引擎索引，並加入 `noindex, nofollow`。
- Firebase Web API key 可放在建置變數中；真正的資料保護依靠 Authentication 與 Firestore 規則。

## 測試與驗收

### 自動測試

- 姓名正規化與 1 至 40 字驗證。
- 未填姓名不能開始測驗。
- 完成資料的分數、答對／答錯數與姓名組裝正確。
- 每次完成產生獨立 attempt，既有進度更新仍可運作。
- 申請狀態映射到正確教師頁狀態。
- Vite 同時建置學生頁與 `teacher.html`。
- Firestore Rules Emulator 覆蓋：
  - 學生可建立自己的合法 attempt。
  - 偽造 UID、非法欄位、更新或刪除 attempt 被拒絕。
  - 未核准帳號不能讀取 attempts。
  - 已核准帳號與管理員可以讀取 attempts。
  - 申請人不能自行核准。
  - 只有管理員能核准及管理 `viewerAccess`。

### 公開環境驗收

- 未填姓名不能開始；合法姓名可以完成測驗。
- 完成後 Firestore 出現一筆包含姓名、分數及 server timestamp 的新紀錄。
- 同一學生再次完成會新增第二筆，不覆蓋第一筆。
- 未申請與待審帳號看不到學生紀錄。
- 管理員可核准測試帳號。
- 核准前讀取被拒絕，核准後可看見歷次紀錄。
- 教師頁登入不會改變學生頁的匿名 UID。
- 測試資料在驗收後清除。

## 不在本次範圍

- 班級、座號、學號與多份試卷管理。
- 成績匯出、統計圖表、通知信與自動核准。
- 家長與特定學生的綁定關係。
- 修改或刪除既有歷次成績。
- Cloud Functions、付費 Identity Platform 功能或自訂 Claims。
