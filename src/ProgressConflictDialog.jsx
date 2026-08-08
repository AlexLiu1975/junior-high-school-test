function formatUpdatedAt(updatedAtMs) {
  if (!Number.isFinite(updatedAtMs) || updatedAtMs <= 0) return "時間不明";
  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Taipei",
  }).format(new Date(updatedAtMs));
}

function progressSummary(progress) {
  const answers = progress?.activeAttempt?.answers;
  const placements = progress?.activeAttempt?.placements;
  if (answers && typeof answers === "object") {
    return `已作答 ${Object.keys(answers).length} 題`;
  }
  if (placements && typeof placements === "object") {
    return `已完成 ${Object.keys(placements).length} 個位置`;
  }
  return progress?.activeAttempt ? "有未完成進度" : "尚未開始作答";
}

export default function ProgressConflictDialog({ quiz, local, cloud, onChoose }) {
  return (
    <section
      aria-labelledby="progress-conflict-title"
      className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm"
    >
      <h2 id="progress-conflict-title" className="text-lg font-bold text-amber-950">
        選擇要繼續的進度
      </h2>
      <p className="mt-2 text-sm leading-6 text-amber-900">
        「{quiz.title}」在這個瀏覽器與雲端都有進度。系統不會自動覆蓋，請確認後選擇。
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onChoose("local")}
          className="rounded-xl border border-amber-300 bg-white p-4 text-left hover:border-amber-500"
        >
          <strong className="block text-amber-950">繼續本機進度</strong>
          <span className="mt-1 block text-xs text-amber-800">
            {progressSummary(local)}・{formatUpdatedAt(local?.updatedAtMs)}
          </span>
        </button>
        <button
          type="button"
          onClick={() => onChoose("cloud")}
          className="rounded-xl border border-amber-300 bg-white p-4 text-left hover:border-amber-500"
        >
          <strong className="block text-amber-950">使用雲端進度</strong>
          <span className="mt-1 block text-xs text-amber-800">
            {progressSummary(cloud)}・{formatUpdatedAt(cloud?.updatedAtMs)}
          </span>
        </button>
      </div>
    </section>
  );
}
