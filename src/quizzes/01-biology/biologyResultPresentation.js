export function biologyResultStatus({ reviewAvailable }) {
  return reviewAvailable
    ? "成績與解析"
    : "完成紀錄已保存；此筆舊成績沒有逐題解析，因此只顯示總成績。";
}

export function biologyConfirmedReviewFailureMessage() {
  return "完成紀錄已保存，但解析暫時無法顯示，請重新整理頁面。";
}
