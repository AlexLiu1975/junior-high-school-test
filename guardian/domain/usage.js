import {
  MINUTES_PER_DAY,
  MS_PER_MINUTE,
  addLocalDays,
  dateKeyOf,
  isDateKey,
  isInstant,
  localParts,
  startOfLocalDay,
} from "./time.js";

export const APP_CATEGORIES = Object.freeze([
  "social",
  "game",
  "video",
  "study",
  "tool",
  "other",
]);
export const MAX_SESSIONS_PER_UPLOAD = 500;
const APP_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const MAX_APP_NAME_LENGTH = 80;

function invalidUsage() {
  throw new Error("invalid-usage-session");
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Foreground segment reported by the device agent. Sessions are half-open
 * [startMs, endMs) so back-to-back segments never double-count the boundary
 * minute.
 */
export function normalizeSession(raw) {
  if (!isRecord(raw)) invalidUsage();
  const allowedKeys = ["appId", "appName", "category", "startMs", "endMs"];
  if (!Object.keys(raw).every((key) => allowedKeys.includes(key))) invalidUsage();
  if (typeof raw.appId !== "string" || !APP_ID_PATTERN.test(raw.appId)) invalidUsage();
  if (
    typeof raw.appName !== "string"
    || raw.appName.length === 0
    || raw.appName.length > MAX_APP_NAME_LENGTH
  ) {
    invalidUsage();
  }
  if (!APP_CATEGORIES.includes(raw.category)) invalidUsage();
  if (!isInstant(raw.startMs) || !isInstant(raw.endMs)) invalidUsage();
  if (raw.endMs <= raw.startMs) invalidUsage();
  if (raw.endMs - raw.startMs > MINUTES_PER_DAY * MS_PER_MINUTE) invalidUsage();
  return Object.freeze({
    appId: raw.appId,
    appName: raw.appName.trim(),
    category: raw.category,
    startMs: raw.startMs,
    endMs: raw.endMs,
  });
}

export function normalizeSessions(raw) {
  if (!Array.isArray(raw) || raw.length > MAX_SESSIONS_PER_UPLOAD) invalidUsage();
  return raw.map(normalizeSession).sort((left, right) => left.startMs - right.startMs);
}

/** Splits sessions that straddle local midnight so each belongs to one day. */
export function splitByLocalDay(sessions, timeZone) {
  const result = [];
  for (const session of sessions) {
    let cursor = session.startMs;
    while (cursor < session.endMs) {
      const dayEnd = addLocalDays(cursor, timeZone, 1);
      const sliceEnd = Math.min(session.endMs, dayEnd);
      result.push(Object.freeze({
        ...session,
        startMs: cursor,
        endMs: sliceEnd,
        dateKey: dateKeyOf(cursor, timeZone),
      }));
      cursor = sliceEnd;
    }
  }
  return result;
}

/**
 * Union of the given intervals in minutes. Screen time must not be inflated
 * when two overlapping segments are reported (picture-in-picture, or a device
 * re-uploading a window it already sent).
 */
export function unionMinutes(sessions) {
  if (!Array.isArray(sessions)) invalidUsage();
  const sorted = [...sessions].sort((left, right) => left.startMs - right.startMs);
  let total = 0;
  let spanStart = null;
  let spanEnd = null;
  for (const session of sorted) {
    if (spanEnd === null || session.startMs > spanEnd) {
      if (spanEnd !== null) total += spanEnd - spanStart;
      spanStart = session.startMs;
      spanEnd = session.endMs;
      continue;
    }
    spanEnd = Math.max(spanEnd, session.endMs);
  }
  if (spanEnd !== null) total += spanEnd - spanStart;
  return total / MS_PER_MINUTE;
}

function roundMinutes(value) {
  return Math.round(value * 10) / 10;
}

function groupTotals(sessions, keyOf, labelOf) {
  const groups = new Map();
  for (const session of sessions) {
    const key = keyOf(session);
    const existing = groups.get(key);
    if (existing) {
      existing.sessions.push(session);
      continue;
    }
    groups.set(key, { key, label: labelOf(session), sessions: [session] });
  }
  return [...groups.values()]
    .map((group) => ({
      key: group.key,
      label: group.label,
      minutes: roundMinutes(unionMinutes(group.sessions)),
      sessionCount: group.sessions.length,
    }))
    .sort((left, right) => right.minutes - left.minutes || left.key.localeCompare(right.key));
}

function withShare(entries, totalMinutes) {
  return entries.map((entry) => Object.freeze({
    ...entry,
    share: totalMinutes > 0 ? Math.round((entry.minutes / totalMinutes) * 1000) / 10 : 0,
  }));
}

/**
 * Per-day statistics powering the dashboard's usage detail: total screen time,
 * per-app and per-category breakdown, and an hourly profile for the heat strip.
 */
export function summarizeDay({ sessions, timeZone, dateKey }) {
  if (!isDateKey(dateKey)) invalidUsage();
  const daySessions = splitByLocalDay(normalizeSessions(sessions), timeZone)
    .filter((session) => session.dateKey === dateKey);
  const totalMinutes = roundMinutes(unionMinutes(daySessions));
  const byApp = withShare(
    groupTotals(daySessions, (session) => session.appId, (session) => session.appName),
    totalMinutes,
  );
  const byCategory = withShare(
    groupTotals(daySessions, (session) => session.category, (session) => session.category),
    totalMinutes,
  );

  const hourly = new Array(24).fill(0);
  for (const session of daySessions) {
    const dayStart = startOfLocalDay(session.startMs, timeZone);
    let cursor = session.startMs;
    while (cursor < session.endMs) {
      const hour = localParts(cursor, timeZone).hour;
      const hourEnd = Math.min(session.endMs, dayStart + (hour + 1) * 60 * MS_PER_MINUTE);
      hourly[hour] += (hourEnd - cursor) / MS_PER_MINUTE;
      cursor = hourEnd;
    }
  }

  return Object.freeze({
    dateKey,
    totalMinutes,
    sessionCount: daySessions.length,
    byApp,
    byCategory,
    hourly: Object.freeze(hourly.map(roundMinutes)),
    firstUseMs: daySessions.length > 0 ? Math.min(...daySessions.map((s) => s.startMs)) : null,
    lastUseMs: daySessions.length > 0 ? Math.max(...daySessions.map((s) => s.endMs)) : null,
    longestSessionMinutes: daySessions.length > 0
      ? roundMinutes(Math.max(...daySessions.map((s) => (s.endMs - s.startMs) / MS_PER_MINUTE)))
      : 0,
  });
}

/** Screen-time minutes already spent on `dateKey`, the quota input for policy. */
export function usedMinutesOn({ sessions, timeZone, dateKey }) {
  return summarizeDay({ sessions, timeZone, dateKey }).totalMinutes;
}

/**
 * Rolls day summaries into a range view: totals, averages, the top apps across
 * the range, and the week-over-week direction shown next to the headline.
 */
export function summarizeRange(daySummaries) {
  if (!Array.isArray(daySummaries) || daySummaries.length === 0) invalidUsage();
  const days = [...daySummaries].sort((left, right) => left.dateKey.localeCompare(right.dateKey));
  const totalMinutes = roundMinutes(days.reduce((sum, day) => sum + day.totalMinutes, 0));
  const averageMinutes = roundMinutes(totalMinutes / days.length);

  const appTotals = new Map();
  for (const day of days) {
    for (const app of day.byApp) {
      const existing = appTotals.get(app.key);
      appTotals.set(app.key, {
        key: app.key,
        label: app.label,
        minutes: (existing?.minutes ?? 0) + app.minutes,
      });
    }
  }
  const topApps = withShare(
    [...appTotals.values()]
      .map((app) => ({ ...app, minutes: roundMinutes(app.minutes) }))
      .sort((left, right) => right.minutes - left.minutes || left.key.localeCompare(right.key)),
    totalMinutes,
  );

  const half = Math.floor(days.length / 2);
  const earlier = days.slice(0, half);
  const later = days.slice(days.length - half);
  const earlierAverage = earlier.length > 0
    ? earlier.reduce((sum, day) => sum + day.totalMinutes, 0) / earlier.length
    : 0;
  const laterAverage = later.length > 0
    ? later.reduce((sum, day) => sum + day.totalMinutes, 0) / later.length
    : 0;
  const trendPercent = earlierAverage > 0
    ? Math.round(((laterAverage - earlierAverage) / earlierAverage) * 1000) / 10
    : null;

  const busiestDay = days.reduce(
    (best, day) => (best === null || day.totalMinutes > best.totalMinutes ? day : best),
    null,
  );

  return Object.freeze({
    fromDateKey: days[0].dateKey,
    toDateKey: days[days.length - 1].dateKey,
    dayCount: days.length,
    totalMinutes,
    averageMinutes,
    topApps: Object.freeze(topApps),
    busiestDateKey: busiestDay?.dateKey ?? null,
    busiestMinutes: busiestDay?.totalMinutes ?? 0,
    trendPercent,
    series: Object.freeze(days.map((day) => Object.freeze({
      dateKey: day.dateKey,
      minutes: day.totalMinutes,
    }))),
  });
}

/**
 * Compares actual usage against the allowance so the dashboard can flag days
 * the child was over budget (possible when a parent granted an unlock).
 */
export function quotaComplianceForDay(daySummary, quotaMinutes) {
  if (!isRecord(daySummary)) invalidUsage();
  if (!Number.isInteger(quotaMinutes) || quotaMinutes < 0) invalidUsage();
  const overMinutes = roundMinutes(Math.max(0, daySummary.totalMinutes - quotaMinutes));
  return Object.freeze({
    dateKey: daySummary.dateKey,
    quotaMinutes,
    usedMinutes: daySummary.totalMinutes,
    overMinutes,
    withinQuota: overMinutes === 0,
    utilization: quotaMinutes > 0
      ? Math.round((daySummary.totalMinutes / quotaMinutes) * 1000) / 10
      : null,
  });
}
