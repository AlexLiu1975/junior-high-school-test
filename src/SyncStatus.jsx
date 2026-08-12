const STATUS_MESSAGES = {
  loading: "正在驗證學生資料並載入進度…",
  synced: "進度已同步。",
  "local-pending": "進度已先保存在這個瀏覽器，正在等待雲端同步。",
  "offline-pending": "網路連線中斷；進度已保存在這個瀏覽器，連線後會再同步。",
  conflict: "這個瀏覽器與雲端都有進度，請選擇要繼續哪一份。",
  "progress-conflict": "雲端進度已更新，請重新載入並選擇要繼續的版本。",
  submitting: "正在保存完成紀錄…",
  "submit-failed": "完成紀錄尚未保存，待送資料仍保留在這個瀏覽器。",
  "refresh-required": "完成紀錄已保存，但無法更新最新進度；請重新整理頁面後再開始新的測驗。",
  "missing-config": "Firebase 設定缺少，暫時只能保存在這個瀏覽器。",
  "bad-identity": "找不到相符的學生姓名與專屬代碼。",
  "inactive-student": "這名學生已停用，無法開始新的測驗。",
  "permission-denied": "雲端拒絕存取，請重新輸入學生姓名與專屬代碼。",
  "version-mismatch": "試卷已更新，請聯絡教師。",
  unavailable: "這份試卷的作答畫面尚未開放。",
};

export default function SyncStatus({ status, message }) {
  const text = message ?? STATUS_MESSAGES[status];
  if (!text) return null;
  const isError = [
    "submit-failed",
    "refresh-required",
    "missing-config",
    "bad-identity",
    "inactive-student",
    "permission-denied",
    "version-mismatch",
    "offline-pending",
  ].includes(status);
  return (
    <p
      role={isError ? "alert" : "status"}
      className={`rounded-xl border px-4 py-3 text-sm ${
        isError
          ? "border-red-200 bg-red-50 text-red-800"
          : "border-slate-200 bg-slate-50 text-slate-700"
      }`}
    >
      {text}
    </p>
  );
}
