# 單字地城後端資料庫架構與雲端方案

## 一、雲端資料庫方案

本專案使用專案已配置的 **Managed MySQL／TiDB 雲端資料庫**。應用程式伺服器透過環境變數 `DATABASE_URL` 連線，老師與學生不需要自行申請、安裝或維護 MySQL。資料庫的實際連線資訊與資料表可在管理介面的 **Database** 面板查看；不要將 `DATABASE_URL`、JWT secret 或 OAuth secret 放入 APP 原始碼。

Expo APP 與瀏覽器客戶端只呼叫同一個 `/api/trpc` 後端。APP 使用安全 token 登入，後端依登入者角色與班級成員關係授權。這種方案適合目前的 MVP 與校內試用；若未來有大量學校、即時通知或區域備援需求，再評估專用資料庫或外部雲端服務。

## 二、核心資料表

| 資料表 | 目的 | 主要關聯 |
|---|---|---|
| `users` | 登入身份與三層角色 | `system_admin`、`teacher`、`student` |
| `classrooms` | 班級名稱、老師、加入碼、啟用狀態 | `teacherId → users.id` |
| `classroomMembers` | 學生加入班級的關聯 | `classroomId`、`studentId` |
| `vocabWords` | 冊次、課次、英文、中文與例句 | `ownerId → users.id` |
| `wordAttempts` | 每次答題、題型、正誤與時間 | `studentId`、`wordId`、`classroomId` |

所有答題時間以 UTC timestamp 保存。遺忘曲線使用連續答對次數計算建議間隔：0、1、2、4、7、14、30 天；答錯會立即列為待複習。

## 三、三層權限

`system_admin` 可管理全域使用者角色、查看全域班級與處理系統設定；`teacher` 只能建立、查看、停用及重設自己建立的班級加入碼，也只能查看自己班級內學生的統計；`student` 只能查看與寫入自己的學習紀錄，並使用有效加入碼加入班級。後端 guard 位於 `server/_core/trpc.ts`，不可只依賴前端隱藏按鈕。

## 四、班級流程

老師登入後呼叫 `teacher.createClassroom` 建立班級，伺服器產生隨機加入碼。老師可使用 `teacher.rotateJoinCode` 重設代碼，或使用 `teacher.setClassroomActive` 停用／重新啟用班級。學生輸入加入碼呼叫 `classrooms.join`；伺服器只接受啟用中的班級，並檢查重複成員關聯。答題同步時，伺服器會驗證學生確實屬於提供的班級，避免偽造他人班級資料。

## 五、主要 API

| API | 權限 | 用途 |
|---|---|---|
| `systemAdmin.users` | 系統管理員 | 查看使用者與角色 |
| `systemAdmin.setUserRole` | 系統管理員 | 設定 `system_admin`／`teacher`／`student` |
| `teacher.createClassroom` | 系統管理員／老師 | 建立班級 |
| `teacher.rotateJoinCode` | 自己班級／系統管理員 | 重設加入碼 |
| `teacher.setClassroomActive` | 自己班級／系統管理員 | 停用或啟用班級 |
| `teacher.overview` | 系統管理員／老師 | 查看可管理班級統計 |
| `teacher.studentPerformance` | 系統管理員／老師 | 查看個別學生複習統計 |
| `classrooms.join` | 學生 | 使用加入碼加入班級 |
| `learning.recordAttempt` | 已登入使用者 | 同步答題紀錄 |

## 六、部署與資料安全

部署前先確認 migration 已透過專案資料庫流程套用，並執行 `pnpm check`、`pnpm test` 及 APP 的 TypeScript／Expo Web 檢查。正式環境啟用 HTTPS，資料庫連線使用 SSL 設定；只在後端使用 `DATABASE_URL`。APP 只保存登入 token 與暫存題庫，不能把資料庫密碼打包進 APK。

目前 JSON 備份可保留題庫、答題統計與教師班級摘要；CSV 適合單字與統計欄位交換，不包含完整班級名冊。正式上線前應定期匯出備份，並由管理員在 Database 面板確認資料表與使用者角色。原生 APP 的 Android／iOS 實機登入、deep link 與檔案分享仍需用 Expo Go 或 EAS 測試版驗證。
