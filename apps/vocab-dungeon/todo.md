# 跨平台 APP 轉製待辦

- [x] 確認採用原生 Expo APP，並提供手機、平板與筆電共用介面。
- [x] 確認使用登入後跨裝置同步學習紀錄。
- [x] 保留手機、平板與筆電的響應式闖關介面。
- [x] 保留教師模式、冊次／課次題庫、單字匯入與遺忘曲線資料。
- [x] 驗證觸控、鍵盤、語音與不同螢幕尺寸的操作。
- [x] 準備 APP 安裝與發布方式。

# 教師模式、正式題庫與遺忘曲線更新待辦

- [x] 確認教師模式使用登入後跨裝置／跨學生同步資料庫。
- [x] 核對康軒國中英文正式冊次與課次選單架構。
- [x] 建立冊次、課次、單字與中文意思的題庫分類資料格式。
- [x] 將自訂單字與答題紀錄連結到學生識別資料。
- [x] 建立教師模式首頁與班級總覽統計。
- [x] 建立個別學生的答題次數、正確率、錯題與今日複習清單。
- [x] 套用間隔複習規則，並顯示單字下次建議複習日期。
- [x] 加入資料匯入／匯出，避免教師模式資料只能留在單一瀏覽器。
- [x] 驗證教材選單、統計畫面、資料保存與響應式操作。
- [x] 保存更新版本並交付教師使用方式。

# APP 完整化補強待辦

- [x] 在 Expo 原生 APP 補上冊次／課次題庫選單與單字匯入介面，接入既有同步 API。
- [x] 使用 Expo 原生語音能力播放真正的英文單字發音，取代非 Web 平台的提示視窗。
- [x] 新增教師資料與題庫的 JSON／CSV 匯入與匯出功能。
- [x] 以 Web 匯出、TypeScript 檢查與 README 限制說明驗證手機、平板與 Web 的操作流程；原生實機仍需用 Expo Go 或正式建置驗證。
- [x] 完成 APP 完整化後建立最新 checkpoint 並交付使用方式。

# APP 資料可靠性補強待辦

- [x] 等待每筆教師題庫同步 API 結果，顯示成功／失敗數量並避免假成功訊息。
- [x] 非管理員匯入時明確顯示僅保存本機；管理員才可同步至共用題庫。
- [x] 新增 CSV 單字匯入與 CSV／JSON 題庫及學習紀錄匯出，明確標示欄位格式。
- [x] 將教師班級摘要納入 JSON 備份，CSV 則明確匯出單字與答題統計欄位。

# CSV 備份相容性補強待辦

- [x] 讓 Expo APP 正確解析自身匯出的完整 CSV 欄位，不再使用簡易貼上格式解析器。
- [x] 在 APP 使用說明與匯入區明確標示 CSV 欄位順序、範例與限制。

# APP 匯入說明補強待辦

- [x] 在 Expo APP 匯入區直接顯示 CSV 欄位順序、範例與「CSV 不含完整班級名冊」限制。

# APP CSV 範例補強待辦

- [x] 在 Expo APP 匯入區直接顯示一行可複製的 CSV 範例資料列。

# 三層權限與班級流程更新待辦

- [x] 將 users.role 擴充為 system_admin、teacher、student，並保留既有帳號相容性。
- [x] 建立老師與班級的關聯，讓老師可建立、停用與重設班級加入碼。
- [x] 建立學生加入碼流程，限制同一學生重複加入同一班級。
- [x] 僅允許系統管理員管理角色與全域資料；老師僅能查看自己班級；學生僅能查看自己的紀錄。
- [x] 建立教師班級總覽、個別學生統計與遺忘曲線複習資料 API。
- [x] 更新 Web 與 Expo APP 的角色顯示、班級建立、加入碼與權限提示介面。
- [x] 新增角色、加入碼、班級範圍與統計 API 的 Vitest 測試。
- [x] 確認目前免設定雲端資料庫的連線、migration、備份與安全限制。
- [x] 撰寫後端資料庫架構與部署說明文件。

# 權限與班級 API 補強待辦

- [x] 強制教師查詢個別學生時必須屬於教師可管理的班級，即使未提供 classroomId 也要驗證。
- [x] 為加入碼流程新增有效加入、無效代碼與重複加入不重複寫入測試；目前以隔離資料層測試 API 行為。
- [x] 為班級範圍與統計 API 新增 teacher 無範圍查詢拒絕、system_admin 全域端點與 student 權限測試；完整資料庫整合測試仍需以測試資料庫執行。

# 學生資料可見範圍測試補強待辦

- [x] 測試 student 呼叫 teacher.overview、teacher.studentPerformance、systemAdmin.allClassrooms 時一律被拒絕。
- [x] 測試 learning.myPerformance 僅允許登入學生查看自己的紀錄，並確認 teacher／system_admin 的權限範圍。

# 個人統計角色範圍修正待辦

- [x] 將 learning.myPerformance 限制為 student；teacher／system_admin 改走教師或系統管理員統計 API。
- [x] 補上 student 可查自己的個人統計、teacher／system_admin 呼叫 learning.myPerformance 被拒絕的 Vitest。

# OAuth Callback 錯誤修正待辦

- [ ] 檢查已發布網域的 OAuth callback 錯誤紀錄與重導向參數。
- [ ] 確認瀏覽器登入 state／nonce 與 callback 網域設定一致。
- [ ] 修正 OAuth callback 的錯誤處理或部署設定。
- [ ] 驗證登入後 session、教師／學生角色與跨裝置 API 同步。
- [ ] 保存 OAuth 修正版並交付使用者重試方式。

# Firebase 遷移與 GitHub 整合待辦

- [x] 完成本地 Mock 的學生端班級加入碼流程與錯誤狀態。
- [x] 完成本地 Mock 的教師班級總覽、建立班級、重設／停用加入碼與學生統計介面。
- [x] 在 Mock 介面顯示不會同步正式資料的明確提示。
- [x] 撰寫 Firebase collection、角色權限與遷移順序文件。
- [ ] 建立或確認 Firebase project，提供 Web／Android／iOS app 設定。
- [ ] 將 tRPC server repository 改接 Firebase Admin SDK，並完成 Firestore Security Rules。
- [ ] 以 Firebase Emulator Suite 驗證 system_admin／teacher／student 與班級資料邊界。
- [ ] 將目前專案安全整合至指定 GitHub 儲存庫，保留既有 Firebase 網站內容。
