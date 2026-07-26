# 學生歷次測驗與教師（家長）紀錄頁設計

日期：2026-07-26  
專案：`AlexLiu1975/junior-high-school-test`

## 目標

讓多人使用同一份測驗。學生使用「專屬代碼＋姓名」進入，每次完成測驗都保留一筆獨立紀錄；教師或家長以 Google 帳號申請權限，經管理員核准後，教師可查看全部學生，家長只能查看申請時指定學生的歷次成績。

唯一管理員帳號為 `beyle931224@gmail.com`。

## 使用者角色

### 學生

- 沿用 Firebase 匿名登入，不需要申請帳號。
- 開始測驗前必須輸入專屬代碼與姓名。
- 專屬代碼與姓名必須完全符合已核准的學生資料。
- 姓名去除前後空白後須為 1 至 40 個字元。
- 可以使用既有的作答、複習排程與清除個人進度功能。
- 完成測驗時新增一筆歷次紀錄。
- 不能讀取教師／家長申請、核准名單或其他學生的歷次紀錄。

### 教師

- 從獨立的教師（家長）紀錄頁使用 Google 帳號登入。
- 第一次登入時以「教師」角色提出存取申請。
- 申請狀態為 `pending`、`approved` 或 `rejected`。
- 只有 `approved` 教師帳號能查看所有歷次測驗紀錄。
- 可以依學生姓名搜尋紀錄；預設依提交時間由新到舊排列。
- 不能核准其他帳號。

### 家長

- 從獨立的教師（家長）紀錄頁使用 Google 帳號登入。
- 第一次登入時以「家長」角色申請，並填寫一位學生姓名。
- 管理員核准時，系統自動建立該學生資料與專屬代碼。
- 家長登入後可以查看學生姓名與專屬代碼。
- 家長只能讀取該專屬學生的歷次測驗紀錄。
- 家長不能自行變更綁定學生、建立代碼或核准其他帳號。
- 一個申請對應一位學生；同一帳號若需對應多位學生，須由管理員逐筆建立核准關係。

### 管理員

- 必須以 `beyle931224@gmail.com` 登入。
- 擁有教師／家長的紀錄查看能力。
- 可以查看所有申請，並核准或拒絕申請。
- 核准教師申請時授予全體紀錄讀取權。
- 核准家長申請時，以申請日期及當日流水號自動產生學生專屬代碼，並綁定家長帳號。
- 管理員資格由 Firestore 安全規則比對已驗證的 Firebase Auth email，不由前端自行判定。

## 頁面與互動

### 學生測驗首頁

- 在「開始測驗」按鈕上方增加「學生專屬代碼」與「測試人姓名」欄位。
- 專屬代碼格式為 `YYYYMMDD-NNN`，例如 `20260726-001`。
- 未輸入有效代碼或姓名時，「開始測驗」維持停用。
- 按下開始時驗證代碼與姓名；不相符時顯示「找不到相符的學生資料」。
- 驗證成功後固定本次學生識別與姓名；返回首頁重新開始時可以修改。
- 結果頁顯示本次測試人姓名。
- 每次按下完成測驗只建立一筆歷次紀錄，避免 React Strict Mode 或重複操作造成重複寫入。

### 教師（家長）紀錄頁

- 路徑為 `/junior-high-school-test/teacher.html`。
- 未登入：顯示 Google 登入按鈕與資料用途說明。
- 已登入、未申請：選擇「教師」或「家長」提出申請；家長必須填寫學生姓名。
- `pending`：顯示等待管理員核准。
- `rejected`：顯示未通過，可用相同角色重新提出申請。
- 已核准教師：顯示所有歷次紀錄表與姓名搜尋。
- 已核准家長：顯示指定學生姓名、專屬代碼及該生歷次紀錄。
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
studentId: approved student document id
studentCode: "20260726-001"
studentName: string (trimmed, 1..40 characters)
score: integer (0..100)
correctCount: integer (0..20)
wrongCount: integer (0..20)
submittedAt: server timestamp
```

`attemptId` 由 Firestore 自動產生。學生只能建立 `studentUid` 等於自己 UID、`studentId`／`studentCode`／`studentName` 符合已核准學生資料，且其他欄位符合上述限制的文件；不能更新或刪除歷次紀錄。

### `accessRequests/{uid}`

```text
uid: Google sign-in uid
email: verified Firebase Auth email
displayName: Google display name
role: "teacher" | "parent"
studentName: string | null
status: "pending" | "approved" | "rejected"
requestedAt: server timestamp
reviewedAt: server timestamp | null
reviewedBy: admin email | null
```

教師申請的 `studentName` 必須為 `null`；家長申請的 `studentName` 必須為去除前後空白後 1 至 40 個字元。申請人只能讀取自己的申請，並建立／重新提出自己的申請。申請人不能自行變更角色或把狀態改為 `approved`。管理員可以讀取及審核全部申請。

### `viewerAccess/{uid}`

```text
uid: Google sign-in uid
email: verified Firebase Auth email
role: "teacher" | "parent"
studentIds: string[]
approvedAt: server timestamp
approvedBy: "beyle931224@gmail.com"
```

教師的 `studentIds` 為空陣列並代表全體紀錄存取；家長的 `studentIds` 只包含管理員核准的學生文件 ID。只有管理員可以建立或刪除核准文件。本人可以讀取自己的核准狀態。歷次紀錄的讀取權限以角色及 `studentIds`，或登入 email 為管理員，作為判斷依據。

### `students/{studentId}`

```text
studentId: auto-generated document id
studentCode: "20260726-001"
studentName: trimmed display name
parentUid: approved parent Google uid
requestId: source access request uid
createdAt: server timestamp
createdBy: "beyle931224@gmail.com"
```

只有管理員及綁定家長可以讀取學生文件。只有管理員可以建立學生文件。學生端不直接讀取此文件。

### `studentEntries/{studentCode}/names/{studentName}`

```text
studentId: matching students document id
active: true
```

文件路徑同時包含專屬代碼及已正規化姓名。姓名不得包含 `/`。匿名學生只能對自己輸入的完整路徑執行單筆 `get`，不能列出代碼或姓名；文件內容不包含家長帳號。只有管理員可建立、更新或刪除。此文件用於開始測驗及建立 attempt 時驗證「代碼＋姓名」配對。

### `dailyCounters/{YYYYMMDD}`

```text
nextSequence: integer (1..1000)
updatedAt: server timestamp
```

管理員核准家長申請時，在 Firestore transaction 中讀取並增加申請日期的計數器，同時建立 `students`、`studentEntries`、`viewerAccess` 並更新申請狀態。日期使用 `requestedAt` 轉換為 `Asia/Taipei` 的 `YYYYMMDD`；流水號從 `001` 至 `999`，每日重新開始。達到 `999` 後停止核准並顯示明確錯誤。同一申請若已核准，重複操作不得產生第二組代碼。

### 現有個人進度

`users/{uid}/quizProgress/{quizId}` 維持原結構與本人限定的讀寫規則。姓名與歷次紀錄不改變既有複習排程資料。

## Firestore 安全規則

- 預設拒絕所有未明確允許的讀寫。
- 匿名或 Google 使用者只能讀寫自己的 `quizProgress`。
- 已登入使用者只能新增符合欄位、型別、範圍及本人 UID 限制的 `quizAttempts`。
- 建立 attempt 時，規則必須讀取對應 `studentEntries/{studentCode}/names/{studentName}`，並驗證 `studentId` 相符且 `active == true`。
- 客戶端不能更新或刪除 `quizAttempts`。
- 只有管理員、已核准教師，或 `viewerAccess/{uid}.studentIds` 包含該 attempt `studentId` 的已核准家長能讀取 `quizAttempts`。
- 家長查詢必須包含自己已核准 `studentId` 的等值條件；不得執行全體紀錄查詢。
- 申請人只能管理自己的申請，且不能自行核准。
- 匿名學生只能單筆讀取已知完整路徑的 `studentEntries`，不能列出或查詢。
- 只有管理員能列出申請、變更審核狀態，或管理 `viewerAccess`、`students`、`studentEntries` 與 `dailyCounters`。
- 管理員判定必須同時要求登入 token 的 email 為 `beyle931224@gmail.com` 且 `email_verified == true`。

## 資料流

1. 教師或家長以 Google 帳號申請；家長同時提供學生姓名。
2. 管理員核准教師，或以 transaction 核准家長並產生 `YYYYMMDD-NNN` 專屬代碼。
3. 家長登入後取得綁定學生姓名與專屬代碼。
4. 學生匿名登入並載入自己的複習進度。
5. 學生輸入專屬代碼與姓名，對完整 `studentEntries` 路徑執行單筆讀取驗證。
6. 驗證成功後開始測驗。
7. 完成時先計算分數與下一次複習資料。
8. 個人複習進度寫入原有文件。
9. 歷次結果以新的自動 ID 寫入 `quizAttempts`。
10. 已核准教師查詢全部 attempts；已核准家長以核准 `studentId` 查詢；管理員另查詢待審申請。

## 個資與安全

- 公開頁面不提供全體紀錄讀取能力。
- 前端顯示權限不是安全邊界，所有敏感讀取都必須通過 Firestore 規則。
- 不收集生日、班級、學號或其他非必要欄位。
- 姓名與專屬代碼會傳送至 Firebase；學生首頁須顯示用途說明。
- 專屬代碼是學生識別碼，不是家長讀取成績的密碼；家長讀取仍須通過 Google 登入與核准關係。
- 日期流水號具可預測性，因此必須與完全相符的學生姓名一起驗證，且不能單獨授予任何讀取權限。
- 教師頁不提供公開匯出、分享連結或搜尋引擎索引，並加入 `noindex, nofollow`。
- Firebase Web API key 可放在建置變數中；真正的資料保護依靠 Authentication 與 Firestore 規則。

## 測試與驗收

### 自動測試

- 姓名正規化、禁止 `/` 與 1 至 40 字驗證。
- 專屬代碼 `YYYYMMDD-NNN` 格式驗證。
- 未填姓名或代碼不能開始測驗。
- 不相符的姓名與代碼不能開始測驗。
- 完成資料的分數、答對／答錯數與姓名組裝正確。
- 每次完成產生獨立 attempt，既有進度更新仍可運作。
- 申請狀態映射到正確教師頁狀態。
- 家長與教師角色映射到不同資料查詢範圍。
- 台北申請日期與每日流水號產生正確，並處理並行核准、重複核准及每日上限。
- Vite 同時建置學生頁與 `teacher.html`。
- Firestore Rules Emulator 覆蓋：
  - 學生可建立自己的合法 attempt。
  - 偽造 UID、非法欄位、更新或刪除 attempt 被拒絕。
  - 未核准帳號不能讀取 attempts。
  - 已核准教師與管理員可以讀取全部 attempts。
  - 已核准家長只能讀取 `studentIds` 內的 attempts。
  - 家長缺少學生篩選條件的全體查詢被拒絕。
  - 匿名學生只能單筆驗證已知的代碼與姓名，不能列出學生。
  - 申請人不能自行核准。
  - 只有管理員能核准及管理學生、流水號與 `viewerAccess`。

### 公開環境驗收

- 未填姓名或代碼不能開始；正確配對可以完成測驗。
- 錯誤姓名或代碼不能開始，也不能列出有效學生。
- 完成後 Firestore 出現一筆包含姓名、分數及 server timestamp 的新紀錄。
- 同一學生再次完成會新增第二筆，不覆蓋第一筆。
- 未申請與待審帳號看不到學生紀錄。
- 管理員可核准教師與家長測試帳號。
- 家長核准後取得符合申請日期與流水號格式的專屬代碼。
- 教師核准後可看全部紀錄；家長核准後只能看指定學生。
- 教師頁登入不會改變學生頁的匿名 UID。
- 測試資料在驗收後清除。

## 不在本次範圍

- 班級、座號、學號與多份試卷管理。
- 成績匯出、統計圖表、通知信與自動核准。
- 家長自行變更綁定學生，或不經管理員核准新增第二位學生。
- 修改或刪除既有歷次成績。
- Cloud Functions、付費 Identity Platform 功能或自訂 Claims。
