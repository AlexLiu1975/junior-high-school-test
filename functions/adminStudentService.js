import { requireAdminAuth } from "./adminIdentity.js";

const STUDENT_ID = /^[A-Za-z0-9_-]{1,128}$/;

function requireStudentId(input) {
  if (
    input === null
    || typeof input !== "object"
    || Array.isArray(input)
    || Object.keys(input).length !== 1
    || !Object.hasOwn(input, "studentId")
  ) {
    throw new Error("invalid-student-id");
  }
  const studentId = input?.studentId;
  if (typeof studentId !== "string" || !STUDENT_ID.test(studentId)) {
    throw new Error("invalid-student-id");
  }
  return studentId;
}

export async function removeOrDeactivateStudent({ repository, auth, input }) {
  requireAdminAuth(auth);
  const studentId = requireStudentId(input);
  return repository.runAdminStudentTransaction(studentId, async (operation) => {
    const student = await operation.getStudent();
    if (!student) return { status: "deleted" };
    const [attempts, progress] = await Promise.all([
      operation.listAttempts(),
      operation.listProgress(),
    ]);
    if (attempts.length > 0) {
      await operation.deactivate({
        progress: progress.map((item) => ({ ...item, activeAttempt: null })),
      });
      return { status: "deactivated" };
    }
    await operation.deleteExact();
    return { status: "deleted" };
  });
}
