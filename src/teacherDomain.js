import { normalizeStudentName } from "./quizDomain.js";

export const ADMIN_EMAIL = "beyle931224@gmail.com";

export function getPortalState({
  user,
  request,
  access,
  adminEmail = ADMIN_EMAIL,
}) {
  if (!user) return "signed-out";
  if (user.email === adminEmail && user.emailVerified) return "admin";
  if (access?.role === "teacher") return "teacher";
  if (access?.role === "parent") return "parent";
  if (request?.status === "pending") return "pending";
  if (request?.status === "rejected") return "rejected";
  return "apply";
}

export function validateAccessApplication({ role, studentName }) {
  const name = normalizeStudentName(studentName);
  const validRole = role === "teacher" || role === "parent";
  const validName =
    role === "teacher" ||
    (name.length >= 1 && name.length <= 40 && !name.includes("/"));
  return {
    valid: validRole && validName,
    role,
    studentName: role === "parent" ? name : null,
  };
}

export function formatStudentCode(date, sequence) {
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 999) {
    throw new Error("daily-code-limit");
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );
  return `${values.year}${values.month}${values.day}-${String(sequence).padStart(3, "0")}`;
}

export function buildTeacherAccess(request) {
  return { uid: request.uid, role: "teacher", studentIds: [] };
}

export function buildParentApprovalPaths({ request, sequence }) {
  const requestedAt = request.requestedAt?.toDate?.() ?? request.requestedAt;
  const studentCode = formatStudentCode(requestedAt, sequence);
  const dateKey = studentCode.slice(0, 8);
  const studentName = normalizeStudentName(request.studentName);
  if (!studentName || studentName.includes("/")) {
    throw new Error("invalid-student-name");
  }
  return {
    studentCode,
    counterPath: `dailyCounters/${dateKey}`,
    entryPath: `studentEntries/${studentCode}/names/${studentName}`,
    accessPath: `viewerAccess/${request.uid}`,
    requestPath: `accessRequests/${request.uid}`,
  };
}
