export function joinAttemptPrivate(attempts, privateRecords) {
  const privateById = new Map(privateRecords.map((item) => [item.id, item]));
  return attempts.map((attempt) => ({
    ...attempt,
    maskedIp: privateById.get(attempt.id)?.maskedIp ?? null,
  }));
}
