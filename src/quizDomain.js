const CODE_PATTERN = /^\d{8}-\d{3}$/;

export const normalizeStudentName = (value) => String(value ?? "").trim();

export const normalizeStudentCode = (value) =>
  String(value ?? "").trim().toUpperCase();

export function validateStudentIdentity({ studentName, studentCode }) {
  const normalizedName = normalizeStudentName(studentName);
  const normalizedCode = normalizeStudentCode(studentCode);
  const validName =
    normalizedName.length >= 1 &&
    normalizedName.length <= 40 &&
    !normalizedName.includes("/");
  const validCode = CODE_PATTERN.test(normalizedCode);

  return {
    valid: validName && validCode,
    studentName: normalizedName,
    studentCode: normalizedCode,
    error:
      validName && validCode
        ? null
        : "請輸入有效的學生姓名與專屬代碼。",
  };
}

export function buildAttemptRecord({
  identity,
  uid,
  quizId,
  quizTitle,
  correctCount,
  totalQuestions,
}) {
  return {
    quizId,
    quizTitle,
    studentUid: uid,
    studentId: identity.studentId,
    studentCode: identity.studentCode,
    studentName: identity.studentName,
    score: Math.round((correctCount / totalQuestions) * 100),
    correctCount,
    wrongCount: totalQuestions - correctCount,
  };
}
