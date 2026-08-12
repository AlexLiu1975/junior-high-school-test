const STUDENT_ID = /^[A-Za-z0-9_-]{1,128}$/;

export function validateStudentRemovalTarget(studentId) {
  if (typeof studentId !== "string" || !STUDENT_ID.test(studentId)) {
    throw new Error("invalid-student-id");
  }
  return studentId;
}

export function buildStudentRemovalConfirmation(student) {
  return `確定處理學生「${student.name}」（專屬代碼：${student.code}）？已有測驗紀錄時只會停用學生並保留全部歷程；沒有測驗紀錄時會永久刪除學生、登入與存取資料。此操作無法在畫面上復原。`;
}
