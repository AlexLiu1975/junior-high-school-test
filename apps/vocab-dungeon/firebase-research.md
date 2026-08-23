# Firebase 資料層研究紀錄

查核日期：2026-08-23

## 官方文件重點

1. Firebase 官方指出，Cloud Firestore 的使用者與角色式存取控制應搭配 Firebase Authentication 與 Cloud Firestore Security Rules；規則同時負責存取控制與資料驗證。
2. Firestore Security Rules 可依文件路徑、登入者 `request.auth.uid`、使用者角色與班級成員關係限制讀寫；規則需要在發布前測試，官方提供 Rules simulator 與 Emulator Suite。
3. 因本專案需要系統管理員、老師、學生三層權限，建議採 Firebase Auth + Firestore；角色可存於受保護的 users 文件或由伺服器端／Admin SDK 維護的 custom claims，不能讓用戶端任意提升自己的角色。
4. Firestore 文件可映射目前關聯式資料：users、classrooms、classroomMembers、vocabWords、wordAttempts；班級加入碼應只保存雜湊或受限查詢版本，加入成功後建立 membership 文件。
5. 本專案目前已有 tRPC 後端，因此 Firebase 遷移宜先建立可替換 repository，保留現有 `server/routers.ts` 合約；生產環境由受保護的伺服器端 Firebase Admin SDK 寫入角色、加入碼與答題紀錄，APP 只透過 API 或安全的 Firebase client rules 存取允許資料。

## 官方來源

- [Firebase：Get started with Cloud Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)
- [Firebase：Secure data access for users and groups](https://firebase.google.com/docs/firestore/solutions/role-based-access)
- [Firebase：Test your Cloud Firestore Security Rules](https://firebase.google.com/docs/firestore/security/test-rules-emulator)
- [Firebase：Firebase Authentication](https://firebase.google.com/docs/auth)

## 本專案限制

目前沒有 Firebase project ID、Web config、iOS／Android app identifiers 或 Admin SDK service account，因此本次先完成本地 Mock UI 與遷移設計，不把未連線的 Firebase 當成已啟用的正式資料庫。真正切換前需要使用者提供 Firebase 專案或在 Firebase Console 建立專案並設定 Authentication、Firestore、Security Rules 與必要的 App 註冊資訊。
