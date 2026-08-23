# OAuth 錯誤診斷紀錄

檢查日期：2026-08-23

使用瀏覽器開啟 `https://kangquiz-nsavv8vt.manus.space/` 與 `https://kangquiz-nsavv8vt.manus.space/?from_webdev=1`，兩者皆回傳 Manus Space 的 404 頁面，尚未進入測驗首頁。因此目前已發布網域本身無法作為 OAuth callback 的正常首頁驗證來源；使用者截圖中的 `OAuth callback failed` 可能是登入回傳後落到該發布網域時所產生的後端錯誤，但目前無法從此網域重現完整流程。

本機伺服器的 OAuth callback 路由位於 `server/_core/oauth.ts`。callback 先驗證 code、state 與 nonce，再執行 token exchange、取得使用者、寫入資料庫及建立 session；try/catch 目前會將上述任一步驟統一回傳 `OAuth callback failed`。生產紀錄查詢目前回傳 permission_denied（project logs service under maintenance），因此尚未取得實際 exception。

## 新增檢查結果

在目前開發預覽網域點擊「登入同步」後，瀏覽器被導向 `https://manus.im/maintenance`，頁面顯示 Manus 將於 **2026 年 8 月 25 日 08:00（SGT）** 恢復存取，期間部分使用者暫時無法使用服務。這代表目前 OAuth 起始／回傳流程可能因 Manus 登入服務維護而失敗；此情況不是題庫、班級或前端答題程式造成。部署紀錄服務目前也回傳 permission_denied，無法取得 production exception。
