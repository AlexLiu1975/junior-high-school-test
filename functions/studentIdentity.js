const CODE_PATTERN = /^\d{8}-\d{3}$/;

function invalidStudentIdentity() {
  throw new Error("invalid-student-identity");
}

function normalizeStudentIdentity({ studentCode, studentName } = {}) {
  const normalizedCode = String(studentCode ?? "").trim().toUpperCase();
  const normalizedName = String(studentName ?? "").trim();
  if (
    !CODE_PATTERN.test(normalizedCode)
    || normalizedName.length < 1
    || normalizedName.length > 40
    || normalizedName.includes("/")
  ) {
    invalidStudentIdentity();
  }
  return { studentCode: normalizedCode, studentName: normalizedName };
}

export async function requireStudentIdentity(db, input) {
  const { studentCode, studentName } = normalizeStudentIdentity(input);
  const entry = await db
    .collection("studentEntries")
    .doc(studentCode)
    .collection("names")
    .doc(studentName)
    .get();

  if (!entry.exists) throw new Error("student-entry-not-found");
  const { active, studentId } = entry.data();
  if (active !== true) throw new Error("student-inactive");
  if (typeof studentId !== "string" || studentId.length === 0) {
    throw new Error("student-entry-not-found");
  }

  return { studentId, studentCode, studentName };
}
