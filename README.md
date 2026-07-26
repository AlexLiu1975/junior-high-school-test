# 細胞與顯微鏡 隨堂測驗

國中生物「1〜2冊 第1回 第1、2單元」20 題選擇題測驗網站。作答完成後會標示錯題、
累計每題錯誤次數，並依艾賓浩斯遺忘曲線（1、2、4、7、15、30 天）安排下次複習時間。
進度儲存在 Firebase Firestore，跨裝置以匿名帳號區分。

## 1. 建立 Firebase 專案

你的 Google Cloud 專案 `junior-high-school-test` 已經存在，只需要把 Firebase 加進去：

1. 到 [Firebase 主控台](https://console.firebase.google.com/)
2. 點「新增專案」→ 選擇「使用現有的 Google Cloud 專案」→ 選 `junior-high-school-test`
3. 左側選單「建構」→「Authentication」→ 啟用「匿名」登入方式
4. 左側選單「建構」→「Firestore Database」→ 建立資料庫（正式環境模式即可，稍後會設定規則）
5. 左側「專案設定」（齒輪圖示）→「一般」→ 捲到「你的應用程式」→ 點 Web（`</>`）圖示新增一個 Web 應用程式
6. 複製顯示出來的 `firebaseConfig` 物件裡的值，貼到專案根目錄的 `.env` 檔（見下方）

## 2. 設定 Firestore 安全規則

到 Firestore →「規則」，貼上：

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/quizProgress/{quizId} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

這樣每個人（含匿名帳號）只能讀寫自己的測驗進度。

## 3. 本機設定與執行

```bash
cp .env.example .env
# 打開 .env，填入 firebaseConfig 的各項值
npm install
npm run dev
```

瀏覽器打開終端機顯示的網址（預設 http://localhost:5173）即可測驗。

## 4. 建置與部署（選用：Firebase Hosting）

```bash
npm run build
npm install -g firebase-tools   # 如果還沒裝過
firebase login
firebase init hosting           # public 目錄選 dist，設定為單頁應用程式
firebase deploy
```

## 5. 上傳到 GitHub

這個資料夾已經是 git 倉庫並完成第一次 commit。因為這個環境沒有你的 GitHub 憑證，
請在你自己的電腦上執行：

```bash
git remote add origin git@github.com:AlexLiu1975/junior-high-school-test.git
git push -u origin main
```

（如果你是用 HTTPS + Personal Access Token 登入 GitHub，把上面的網址換成
`https://github.com/AlexLiu1975/junior-high-school-test.git`。）

## 專案結構

```
src/
  App.jsx        測驗主畫面、計分、複習排程邏輯
  firebase.js    Firebase 初始化、匿名登入、讀寫進度
  main.jsx       React 進入點
.env.example     Firebase 設定範本（.env 不會被提交到 git）
```
