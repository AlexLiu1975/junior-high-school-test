import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";

// 這些值請到 Firebase 主控台 → 專案設定 → 一般 → 你的應用程式（Web） 取得，
// 填入專案根目錄的 .env 檔（參考 .env.example）。這些值本身不是機密資訊，
// 真正的存取控管要靠 Firestore 安全規則。
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

/**
 * 匿名登入，回傳目前使用者的 uid。
 * 用 uid 當作每個裝置/使用者的獨立進度空間，不需要帳號密碼。
 */
export function ensureSignedIn() {
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      if (user) {
        resolve(user.uid);
      } else {
        signInAnonymously(auth)
          .then((cred) => resolve(cred.user.uid))
          .catch(reject);
      }
    });
  });
}

const progressDocRef = (uid, quizId) => doc(db, "users", uid, "quizProgress", quizId);

export async function loadProgress(uid, quizId) {
  const snap = await getDoc(progressDocRef(uid, quizId));
  return snap.exists() ? snap.data() : {};
}

export async function saveProgress(uid, quizId, data) {
  await setDoc(progressDocRef(uid, quizId), data);
}
