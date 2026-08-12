function integer(value) {
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function formatDuration(seconds) {
  const duration = integer(seconds);
  if (duration === null) return "時間不明";
  const minutes = Math.floor(duration / 60);
  const remaining = duration % 60;
  return `${minutes}分${String(remaining).padStart(2, "0")}秒`;
}

export function formatAttemptResult(attempt) {
  if (attempt?.resultType === "placement") {
    const completed = integer(attempt.completedCount);
    const total = integer(attempt.totalItems);
    const errors = integer(attempt.errorCount);
    if (completed !== null && total !== null && errors !== null) {
      return `完成 ${completed}／${total}｜錯誤 ${errors} 次｜${formatDuration(attempt.durationSeconds)}`;
    }
  }

  const correct = integer(attempt?.correctCount);
  const wrong = integer(attempt?.wrongCount)
    ?? (correct !== null && integer(attempt?.totalQuestions) !== null
      ? attempt.totalQuestions - correct
      : null);
  if (Number.isFinite(attempt?.score) && correct !== null && wrong !== null && wrong >= 0) {
    return `${attempt.score} 分｜答對 ${correct}｜答錯 ${wrong}`;
  }
  if (correct !== null && integer(attempt?.totalQuestions) !== null) {
    return `答對 ${correct}／${attempt.totalQuestions}`;
  }
  return "尚無成績";
}

export function matchesAttemptSearch(attempt, search) {
  const keyword = String(search ?? "").trim().toLocaleLowerCase("zh-TW");
  if (!keyword) return true;
  return [
    attempt?.studentName,
    attempt?.studentCode,
    attempt?.subject ?? "生物",
    attempt?.quizTitle ?? "生物測驗",
  ]
    .filter((value) => typeof value === "string")
    .some((value) => value.toLocaleLowerCase("zh-TW").includes(keyword));
}
