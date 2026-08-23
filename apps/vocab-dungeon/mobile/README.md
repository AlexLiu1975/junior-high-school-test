# 單字地城｜康軒英文原生 APP

這個 Expo SDK 54 客戶端可使用同一套原生介面在 Android、iOS、平板與筆電 Web 執行。核心功能包含 Manus 登入、Bearer session token、共用題庫、雙關卡英文測驗、第二關聽音拼字、答題紀錄與教師統計入口。

## 啟動前設定

請在啟動指令前設定 `EXPO_PUBLIC_API_URL`，它必須是已發布的網站網址，且該網址能提供 `/api/trpc`、`/api/oauth/mobile/start` 與 `/api/oauth/mobile-callback`。例如：

```bash
EXPO_PUBLIC_API_URL=https://your-project.manus.space pnpm start
```

不要把 API 網址或任何登入憑證寫死在程式碼中。正式上架前，還需要在 OAuth 服務設定 `vocabdungeon://oauth/callback` 對應的原生 redirect／deep link，並使用 iOS Universal Links 或 Android App Links 取代僅有的自訂 scheme。

## 開發指令

```bash
cd mobile
pnpm install
pnpm check
pnpm start
pnpm run android
pnpm run ios
pnpm run web
pnpm exec expo export --platform web
```

iOS 原生建置需要 macOS；沒有 Mac 時可以先用 Expo Go 測試。筆電可用 `pnpm run web` 開啟同一套介面。

## CSV 備份格式

APP 匯出的 CSV 欄位固定順序為 `volume,lesson,english,chinese,example,attempts,correct,wrong,streak,lastAnsweredAt,nextReviewAt`。其中 `volume` 與 `lesson` 是康軒分類，`english` 與 `chinese` 是必要欄位，`example` 可留白；其餘欄位由 APP 匯出的答題統計使用。匯入 CSV 時會依這些欄位建立單字，並還原 attempts、correct、wrong、streak 與 lastAnsweredAt。可直接匯入 APP 自己匯出的 CSV；手動建立檔案時至少要保留前四欄，例如：

```csv
volume,lesson,english,chinese,example,attempts,correct,wrong,streak,lastAnsweredAt,nextReviewAt
8上,L1,healthy,健康的,Healthy food is important.,3,2,1,0,1760000000000,1760000000000
```

JSON 備份則會額外保留登入者、目前班級 ID 與教師班級摘要；CSV 不含登入憑證，也不含完整班級名冊。

## 資料與權限

登入後，APP 將 session token 存在裝置安全儲存區，並以 `Authorization: Bearer <token>` 呼叫後端。學生的答題紀錄會同步到共用資料庫，教師帳號可查看班級摘要與個別學生的複習狀況。未登入前只顯示登入入口，不會建立虛假的學生資料或統計數字。

## 目前交付範圍

這個子專案已完成跨平台 UI scaffold、登入 callback、學生作答、語音／拼字流程與教師統計介面。App Store／Google Play 簽署、正式 OAuth redirect 登記與發布憑證仍需在上架階段設定。

## 維護期間本地 Mock 預覽

若 OAuth 暫時不可用，APP 登入入口仍提供兩個不需網路的示範按鈕：

- **學生示範：加入班級**：進入學生端班級加入碼畫面，輸入 `KNSH2026` 可看到加入成功；輸入其他代碼可驗證錯誤狀態。
- **老師示範：管理班級**：進入教師端，可查看示範班級與統計、建立示範班級、重設加入碼，以及停用／重新啟用班級。

畫面會顯示 `LOCAL MOCK・不會同步正式資料`。Mock 資料只用於介面與操作驗收，不會寫入 Firebase、既有 Managed MySQL／TiDB 或正式學習紀錄。

## Firebase 狀態

目前 APP 的正式跨裝置同步仍使用 `EXPO_PUBLIC_API_URL` 指向的後端 tRPC。Firebase 遷移設計請參考專案根目錄的 `firebase-migration.md`；在提供 Firebase project ID、各平台 app 設定與伺服器端 Admin SDK Secret 前，不會啟用正式 Firebase 寫入。
