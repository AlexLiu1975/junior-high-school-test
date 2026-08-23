# Vocab Dungeon｜康軒國二英文跨平台 APP

這個子目錄保存 Vocab Dungeon 的 React／tRPC 網站與 Expo SDK 54 原生跨平台客戶端，支援手機、平板與筆電 Web。APP 包含學生雙關卡測驗、聽音拼字、語音、間隔複習、CSV／JSON 備份，以及 system_admin／teacher／student 角色與教師班級流程。

目前 `mobile/` 具備 OAuth 維護期間的本地 Mock 預覽：學生示範加入碼為 `KNSH2026`；老師示範可查看班級統計、建立班級、重設／停用加入碼。畫面會標示 `LOCAL MOCK・不會同步正式資料`。

Firebase 遷移設計與設定前置條件請閱讀 `firebase-migration.md`。本子專案目前尚未連線到 Firebase production，正式資料仍依既有 tRPC 設定運作；請勿將 Firebase Admin SDK 憑證提交至此儲存庫。
