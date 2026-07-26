export function getFirebaseConfig() {
  const env = import.meta.env ?? {};
  return {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  };
}

export function getMissingFirebaseConfigKeys(config) {
  return Object.entries(config)
    .filter(([, value]) => typeof value !== "string" || value.trim() === "")
    .map(([key]) => key);
}
