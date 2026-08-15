# 守護時間 — 小孩端 App（iOS / Android）

Expo（React Native）專案。介面、同步、離線判定、延長申請都已完成；**真正把手機鎖住
需要各平台的原生模組**，原因與作法如下。

```bash
cd mobile
npm install
cp ../.env.example .env          # 改成 EXPO_PUBLIC_ 開頭的變數，見 src/config.js
npx expo start                   # 介面與流程可直接跑
```

在 Expo Go 或模擬器上，App 會偵測不到原生模組，並在畫面上顯示黃色橫幅提醒「尚未完成
權限設定，時間到時無法真正鎖定」——不會假裝已經保護好手機。

## 架構

| 檔案 | 作用 |
| --- | --- |
| `App.jsx` | 兩個迴圈：每 5 分鐘同步一次，每 15 秒用快取政策重新判定 |
| `src/guardianClient.js` | 呼叫 callable、快取政策與家長鎖定、離線時本機判定 |
| `src/enforcement/index.js` | 與原生模組的唯一介面；缺模組時退回不動作但誠實回報 |
| `src/screens/PairingScreen.jsx` | 輸入家長給的 6 位配對碼 |
| `src/screens/HomeScreen.jsx` | 剩餘時間、今日用量、申請延長 |
| `src/screens/LockScreen.jsx` | 鎖定原因與下次可用時間 |

判定邏輯不在這裡實作——它 `import` 自 `guardian/domain/`，與後端同一份程式碼
（`metro.config.js` 的 `watchFolders` 讓 Metro 讀得到上層目錄）。手機與伺服器對
「現在該不該鎖」永遠不會有兩種答案。

## Android 原生模組（`GuardianEnforcement`）

需要 `expo prebuild` 產生原生專案後加入。

- **使用統計**：`UsageStatsManager.queryEvents()` 取得前景切換事件，轉成
  `{ appId, appName, category, startMs, endMs }`。需引導家長到
  「設定 → 應用程式 → 特殊存取權 → 使用情況存取權」開啟一次。
- **封鎖**：兩種做法
  - 建議：把 App 設為 **Device Owner**（新機或恢復原廠後用 `adb dpm set-device-owner`
    或 QR 佈建），即可用 `DevicePolicyManager.setPackagesSuspended()` 停用 App、
    `lockNow()` 立即鎖定螢幕。最穩、最難繞過。
  - 一般家庭較實際：前景服務 + `SYSTEM_ALERT_WINDOW` 覆蓋層，偵測到非白名單 App
    在前景時蓋上鎖定畫面。需要「顯示在其他應用程式上層」權限。
- **開機自動啟動**：`RECEIVE_BOOT_COMPLETED`，避免重開機後失效。
- **白名單**：撥號、簡訊與家長設定的 App 不套用暫停或覆蓋。

## iOS 原生模組（`GuardianScreenTime`）

- **必要條件**：向 Apple 申請 `com.apple.developer.family-controls` 權限
  （<https://developer.apple.com/contact/request/family-controls>），且小孩的裝置需為
  家庭共享中的兒童帳號或受監督裝置。沒有這個權限，iOS 上無法真正封鎖 App。
- **授權**：`AuthorizationCenter.shared.requestAuthorization(for: .child)`
- **封鎖**：`ManagedSettingsStore().shield.applications = <ApplicationTokens>`；系統會在
  被擋的 App 前顯示遮罩畫面，可用 `ShieldConfiguration` 擴充自訂文案（顯示解鎖時間）。
- **排程**：`DeviceActivityCenter` 註冊時段，時間到由系統喚醒擴充套用或解除遮罩，
  App 不需要常駐。
- **統計**：`DeviceActivityReport` 擴充內可取得使用時間，但**只有分類與不透明的
  ApplicationToken，取不到 App 名稱**。因此 iOS 回報的 `appId` 是分類代號，
  家長後台在 iOS 裝置上呈現分類統計。

## 為什麼要有本機判定

小孩把飛航模式打開、或家裡網路斷線，都不應該讓管制失效。App 每次同步都會存下政策與
家長的鎖定狀態，離線時用同一套規則繼續判定；沒收到新政策就沿用舊的，不會因為連不上
伺服器就放行。恢復連線後，離線期間累積的使用明細會補傳。
