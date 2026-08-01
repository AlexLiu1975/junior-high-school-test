export function planAdminStudentCreation({
  adminUid,
  studentId,
  studentName,
  studentCode,
  sequence,
}) {
  return {
    student: {
      name: studentName,
      code: studentCode,
      active: true,
      ownerUid: adminUid,
      ownerType: "admin",
    },
    entry: { active: true, studentId },
    link: { studentId },
    nextSequence: sequence + 1,
  };
}
