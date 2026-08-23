# Firebase 遷移與本地 Mock 使用說明

## 目前狀態

本版本已完成 Expo APP 的本地 Mock 預覽：未登入也可以從入口選擇「學生示範：加入班級」或「老師示範：管理班級」。學生可輸入示範加入碼 `KNSH2026`，老師可查看示範班級、複製加入碼、建立示範班級、重設加入碼及停用／啟用班級。畫面上會顯示 `LOCAL MOCK・不會同步正式資料`，Mock 資料不會寫入正式資料庫，也不代表真實學生紀錄。

目前真正的跨裝置資料仍由既有 `/api/trpc` 後端與 Managed MySQL／TiDB 提供。Firebase 尚未接通，因為尚未提供 Firebase project ID、Web／Android／iOS app 設定及伺服器端 Admin SDK 憑證；因此不應把本版本視為已完成 Firebase 搬遷。

## 建議的 Firebase 方案

採用 Firebase Authentication + Cloud Firestore。Authentication 負責帳號登入，Firestore 保存題庫、班級、成員與答題紀錄，Cloud Firestore Security Rules 負責用戶端資料邊界；老師與系統管理員的角色提升則由伺服器端 Admin SDK 或受保護的管理 API 執行，不能由 APP 直接修改自己的角色。

| Firestore collection | 主要欄位 | 存取原則 |
|---|---|---|
| `users/{uid}` | `role`, `name`, `email`, `createdAt` | 使用者讀自己；角色僅系統管理員／伺服器可改 |
| `classrooms/{classroomId}` | `teacherId`, `name`, `joinCodeHash`, `isActive`, `createdAt` | 老師管理自己的班級；系統管理員全域管理 |
| `classroomMembers/{memberId}` | `classroomId`, `studentId`, `joinedAt` | 學生只能新增自己的 membership；老師只能讀所屬班級 |
| `vocabWords/{wordId}` | `volume`, `lesson`, `english`, `chinese`, `example`, `ownerId` | 公開正式題庫唯讀；教師自訂題庫由權限控管 |
| `wordAttempts/{attemptId}` | `studentId`, `wordId`, `classroomId`, `correct`, `questionType`, `answeredAt` | 學生只能新增自己的紀錄；老師只能讀自己班級的聚合範圍 |

`teacher.overview`、`teacher.studentPerformance` 與 `learning.myPerformance` 等既有 tRPC 合約應保留，先以 repository 介面包住資料存取，讓前端與 APP 不必因 MySQL 改成 Firestore 而重寫。遺忘曲線的下次複習日期建議由答題紀錄計算，或在伺服器端寫入彙總欄位，避免每次載入班級統計都掃描全部歷史紀錄。

## 遷移順序

1. 在 Firebase Console 建立專案並啟用 Authentication、Cloud Firestore 與 App Check；註冊 Web、Android 與 iOS app。
2. 建立 Firestore indexes 與 Security Rules，先使用 Emulator Suite／Rules simulator 測試角色與班級範圍。
3. 在伺服器端加入 Firebase Admin SDK repository，將現有 tRPC procedure 保持不變。
4. 將正式題庫以受控的管理腳本匯入 Firestore；不要直接把學生答題紀錄當成測試資料寫入生產庫。
5. 以 staging project 驗證登入、班級加入碼、答題同步、教師統計與備份，確認無誤後再切換 production。

## 必須由使用者提供的設定

真正切換 Firebase 前，需要 Firebase project ID、Web config、Android package name、iOS bundle identifier，以及伺服器端 Admin SDK 的安全憑證。Admin SDK 憑證不得放進 GitHub、APP bundle 或前端環境變數；應使用部署平台的 Secret／Environment Variables。由於 Firebase 設定可能涉及安全憑證，本專案不會自行產生或猜測任何值。

## 官方參考

- [Firebase Authentication](https://firebase.google.com/docs/auth)
- [Cloud Firestore Security Rules 入門](https://firebase.google.com/docs/firestore/security/get-started)
- [Firestore 角色式存取](https://firebase.google.com/docs/firestore/solutions/role-based-access)
- [測試 Cloud Firestore Security Rules](https://firebase.google.com/docs/firestore/security/test-rules-emulator)
