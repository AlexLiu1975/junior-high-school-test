export function getAdminViewData({
  mode,
  allAttempts,
  ownStudents,
  ownAttempts,
}) {
  return mode === "students"
    ? { students: ownStudents, attempts: ownAttempts }
    : { students: [], attempts: allAttempts };
}
