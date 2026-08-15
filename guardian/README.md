# 守護時間 Guardian — 家長手機時間管理

家長在網頁後台設定「哪些時段可以用、每天總共可以用多久」，小孩手機上的 App 依照
同一套規則自動鎖定；家長可以看使用明細、遠端一鍵鎖定，小孩可以申請延長時間。

適用情境：一般家庭、iOS 與 Android 雙平台。

---

## 這個版本包含什麼

| 元件 | 位置 | 狀態 |
| --- | --- | --- |
| 規則引擎（時段、額度、就寢、鎖定判定） | `guardian/domain/` | 完成，91 項測試 |
| 後端服務（同步、指令、申請、配對、統計） | `guardian/server/` | 完成，可部署為 Firebase Functions |
| 資料庫安全規則 | `guardian/firestore.rules` | 完成 |
| 家長網頁後台 | `src/guardian/`、`guardian.html` | 完成，可直接開啟示範模式 |
| 小孩手機 App（Expo，雙平台） | `mobile/` | 介面與同步邏輯完成；**OS 層封鎖需原生模組**（見 `mobile/README.md`） |

先看畫面最快的方法：

```bash
npm install
npm run build
npx vite preview
# 開啟 http://localhost:4173/junior-high-school-test/guardian.html?demo=1
```

示範模式會在瀏覽器裡跑一份完整後端（含兩週假資料），一鍵鎖定、核准延長、修改時段
都是真的在跑同一套程式，不需要 Firebase 帳號。

---

## 規則怎麼判定

一切集中在 `evaluateDeviceState()`（`guardian/domain/policy.js`）。手機端與後端呼叫
同一支函式，所以「離線」與「連線」的判定結果一致。優先順序由高到低：

1. **家長手動鎖定** — 一鍵鎖定，只有家長能解除，勝過所有時段設定
2. **暫停管制** — 放假、生病時整個停用管制
3. **家長臨時開放** — 指定分鐘數，暫時略過時段與額度
4. **就寢時間** — 例如 22:00–06:00，跨午夜；勝過可用時段
5. **可用時段** — 例如週一到週五 06:00–07:00
6. **每日額度** — 例如每天 60 分鐘；即使還在時段內，用完就鎖

回傳值同時包含 `lockAtMs`（幾點會鎖）與 `nextUnlockAtMs`（幾點會開），前端的倒數與
「明天 06:00 可再使用」都由此而來。

以使用者提出的例子來說：設定週一至週五 `06:00–07:00`、每日額度 60 分鐘，則
06:00 解鎖、07:00 準時鎖定；若小孩在 06:30 前把 60 分鐘用完（例如前一晚家長開放過），
06:30 就會鎖，並顯示明天 06:00 再開。

### 時區與日光節約時間

所有判定都以家庭設定的時區（預設 `Asia/Taipei`）換算本地時間。`guardian/domain/time.js`
以 `Intl.DateTimeFormat` 取得本地時鐘，並針對日光節約時間的日子重新對齊，測試涵蓋
美國春季調時當天，未來若有家庭在有 DST 的地區也不會算錯。

跨午夜的時段（例如 23:00–01:00）必須拆成兩段設定，這是刻意的：每一段使用時間都要
明確屬於某一天的額度，否則統計與額度會互相矛盾。就寢時間則允許跨午夜。

---

## 資料流

```
小孩手機 App ──(每 5 分鐘 / 回到前景)──► guardianSync
   ▲                                        │ 上傳使用明細、取得政策與待執行指令
   │ 本機每 15 秒重新判定（離線也準）        ▼
   └───────────────────────────────  Firestore（單一家庭文件樹）
                                            ▲
家長網頁後台 ──guardianDashboard────────────┘
             ──guardianIssueCommand（一鍵鎖定／臨時開放）
             ──guardianUpdatePolicy（時段設定）
             ──guardianDecideRequest（核准延長）
```

**離線行為**：手機每次同步會把政策、目前判定與家長的鎖定狀態寫入本機儲存。斷網時
以快取的規則繼續判定，因此「關掉網路就解鎖」不會發生（`guardian/test/guardian-service.test.mjs`
有一項測試專門守住這個行為）。

**重複上傳**：使用時間以區間聯集計算，同一段時間重複上傳或兩個 App 同時前景都不會
被重複計算。

### Firestore 結構

```
guardianFamilies/{familyId}          { name, parentUids: [uid] }
  children/{childId}                 { displayName, avatarColor }
  policies/{childId}                 { timeZone, dailyQuotaMinutes, windows, bedtime, allowlist, paused }
  devices/{deviceId}                 { childId, platform, override, state, lastSeenAtMs, revoked }
  usage/{childId}_{YYYY-MM-DD}       { sessions: [{ appId, appName, category, startMs, endMs }] }
  requests/{requestId}               延長申請
  commands/{commandId}               家長指令（lock / unlock / sync）
  audit/{autoId}                     家長操作稽核（僅伺服器可寫）
  outbox/{autoId}                    推播佇列（僅伺服器可寫）
guardianPairings/{code}              一次性配對碼（任何用戶端都不可讀）
```

安全模型：**所有寫入都必須經過 callable function**。Firestore 規則只開放家長讀取自己
家庭的資料，寫入一律拒絕，所以就算有人拿到前端權杖，也無法直接改時段、偽造使用
紀錄或清掉鎖定。

---

## 裝置配對

1. 家長在後台「裝置」分頁按「產生配對碼」→ 得到 6 位數字，15 分鐘有效、只能用一次
2. 小孩手機安裝 App，輸入配對碼
3. 後端驗證後建立裝置文件，並簽發帶有 `{ role: "device", familyId, childId, deviceId }`
   宣告的自訂權杖

配對碼由 CSPRNG 產生，且存在完全不可被用戶端讀取的集合中。家長可隨時「解除連結」，
之後該裝置的所有呼叫都會被拒絕，但歷史統計會保留。

---

## 部署

前置：Firebase 專案（Auth + Firestore + Functions，Blaze 方案才能部署排程函式）。

1. **後端**：把 `guardian/server/` 的內容併入 `functions/`（或在 `firebase.json` 以
   `codebase` 方式新增第二組函式），然後 `firebase deploy --only functions`
2. **安全規則**：把 `guardian/firestore.rules` 的 `guardianFamilies` 與 `guardianPairings`
   區塊併入根目錄的 `firestore.rules`，再 `firebase deploy --only firestore:rules`
3. **家長後台**：`npm run build` 會一併輸出 `dist/guardian.html`，隨現有網站部署
4. **家庭資料**：建立 `guardianFamilies/{familyId}`，把家長的 Firebase Auth uid 放進
   `parentUids`，並在 `children` 下建立每個小孩
5. **小孩 App**：見 `mobile/README.md`

沒有填 Firebase 設定時，家長後台會自動進入示範模式，不會出現空白畫面。

---

## 誠實說明：兩個平台能做到的事不一樣

這是選擇雙平台方案時最重要的一件事，Android 與 iOS 對第三方 App 的授權差很多：

| 能力 | Android | iOS |
| --- | --- | --- |
| 逐一 App 的使用時間統計 | ✅ `UsageStatsManager`，需家長授權一次 | ❌ 系統不提供 App 名稱給第三方，只能取得**分類**層級 |
| 時間到自動封鎖 | ✅ Device Admin `lockNow()` / 暫停 App，或前景服務加覆蓋層 | ✅ Screen Time 的 `ManagedSettings` 遮罩，**需要 Apple 核准 Family Controls 權限** |
| 遠端一鍵鎖定 | ✅ | ✅ |
| 緊急電話 | 永遠可用 | 永遠可用（系統保證） |

因此家長後台在 iOS 裝置上會顯示分類統計（影音／遊戲／社群…），Android 才有逐一 App
的排行。這是系統限制，不是實作缺口；任何宣稱能在 iOS 上取得完整 App 使用明細的方案，
不是使用 MDM（需要另外的裝置監督流程），就是不合規。

申請 Family Controls 權限：<https://developer.apple.com/contact/request/family-controls>

---

## 設計原則

**這是給家庭使用的公開管理工具，不是監控軟體。** 幾個刻意的設計決定：

- 小孩手機上看得到與家長完全相同的規則、剩餘時間與鎖定原因；沒有隱藏模式
- 鎖定畫面一定會說明原因與下次可用時間
- 不收集訊息內容、通話紀錄、位置或瀏覽紀錄，只記錄「哪個 App、用了多久」
- 家長的每一次鎖定、改設定、核准都寫入稽核紀錄
- 緊急電話與家長設定的白名單 App 永遠不受鎖定影響

如果需要的是「小孩不知情」的監看，這套系統不適合，也不應該這樣用。

---

## 測試

```bash
node --test "guardian/test/*.test.mjs"     # 91 項，涵蓋規則、時區、統計、服務流程
```

測試裡刻意包含幾個容易出錯的地方：跨日光節約時間的日期計算、跨午夜的使用時段切分、
重複上傳不重複計算、離線時家長鎖定不會失效、延長申請的每日加時上限與逾時。
