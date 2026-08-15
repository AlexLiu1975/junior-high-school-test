import {
  MINUTES_PER_DAY,
  formatTimeOfDay,
  isTimeOfDay,
  isTimeZone,
  minutesOfDay,
} from "./time.js";

export const POLICY_FIELDS = Object.freeze([
  "timeZone",
  "dailyQuotaMinutes",
  "windows",
  "bedtime",
  "allowlist",
  "paused",
]);
export const MAX_WINDOWS_PER_DAY = 6;
export const MAX_DAILY_QUOTA_MINUTES = MINUTES_PER_DAY;
export const MAX_ALLOWLIST_SIZE = 40;
const APP_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export const DEFAULT_POLICY = Object.freeze({
  timeZone: "Asia/Taipei",
  dailyQuotaMinutes: 60,
  windows: Object.freeze({
    0: Object.freeze([Object.freeze({ start: "09:00", end: "11:00" })]),
    1: Object.freeze([Object.freeze({ start: "06:00", end: "07:00" })]),
    2: Object.freeze([Object.freeze({ start: "06:00", end: "07:00" })]),
    3: Object.freeze([Object.freeze({ start: "06:00", end: "07:00" })]),
    4: Object.freeze([Object.freeze({ start: "06:00", end: "07:00" })]),
    5: Object.freeze([Object.freeze({ start: "06:00", end: "07:00" })]),
    6: Object.freeze([Object.freeze({ start: "09:00", end: "11:00" })]),
  }),
  bedtime: Object.freeze({ start: "22:00", end: "06:00" }),
  allowlist: Object.freeze(["phone", "messages", "emergency-sos"]),
  paused: false,
});

function invalidPolicy() {
  throw new Error("invalid-policy");
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeWindowList(raw) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_WINDOWS_PER_DAY) invalidPolicy();
  const windows = raw.map((entry) => {
    if (!isRecord(entry)) invalidPolicy();
    const keys = Object.keys(entry);
    if (keys.length !== 2 || !keys.includes("start") || !keys.includes("end")) invalidPolicy();
    if (!isTimeOfDay(entry.start) || !isTimeOfDay(entry.end)) invalidPolicy();
    const start = minutesOfDay(entry.start);
    const end = minutesOfDay(entry.end);
    // A window that would cross midnight must be split into two entries so that
    // every window belongs to exactly one quota day.
    if (end <= start) invalidPolicy();
    return { start, end };
  });
  windows.sort((left, right) => left.start - right.start);
  for (let index = 1; index < windows.length; index += 1) {
    if (windows[index].start < windows[index - 1].end) invalidPolicy();
  }
  return windows.map(({ start, end }) => Object.freeze({
    start: formatTimeOfDay(start),
    end: formatTimeOfDay(end),
    startMinutes: start,
    endMinutes: end,
  }));
}

function normalizeBedtime(raw) {
  if (raw === undefined || raw === null) return null;
  if (!isRecord(raw)) invalidPolicy();
  const keys = Object.keys(raw);
  if (keys.length !== 2 || !keys.includes("start") || !keys.includes("end")) invalidPolicy();
  if (!isTimeOfDay(raw.start) || !isTimeOfDay(raw.end)) invalidPolicy();
  const start = minutesOfDay(raw.start);
  const end = minutesOfDay(raw.end);
  if (start === end) invalidPolicy();
  return Object.freeze({
    start: raw.start,
    end: raw.end,
    startMinutes: start,
    endMinutes: end,
    crossesMidnight: end < start,
  });
}

function normalizeAllowlist(raw) {
  if (raw === undefined) return Object.freeze([]);
  if (!Array.isArray(raw) || raw.length > MAX_ALLOWLIST_SIZE) invalidPolicy();
  const ids = raw.map((entry) => {
    if (typeof entry !== "string" || !APP_ID_PATTERN.test(entry)) invalidPolicy();
    return entry;
  });
  if (new Set(ids).size !== ids.length) invalidPolicy();
  return Object.freeze([...ids].sort());
}

/**
 * Validates a raw policy document and returns a frozen, minute-resolved form.
 * Both the callable API and the device client normalize before use so the
 * scheduler never sees a half-trusted shape.
 */
export function normalizePolicy(raw) {
  if (!isRecord(raw)) invalidPolicy();
  if (!Object.keys(raw).every((key) => POLICY_FIELDS.includes(key))) invalidPolicy();
  if (!isTimeZone(raw.timeZone)) invalidPolicy();
  if (
    !Number.isInteger(raw.dailyQuotaMinutes)
    || raw.dailyQuotaMinutes < 0
    || raw.dailyQuotaMinutes > MAX_DAILY_QUOTA_MINUTES
  ) {
    invalidPolicy();
  }
  if (!isRecord(raw.windows)) invalidPolicy();
  const windowKeys = Object.keys(raw.windows);
  if (!windowKeys.every((key) => /^[0-6]$/.test(key))) invalidPolicy();
  const windows = {};
  for (let weekday = 0; weekday < 7; weekday += 1) {
    windows[weekday] = Object.freeze(normalizeWindowList(raw.windows[String(weekday)]));
  }
  if (raw.paused !== undefined && typeof raw.paused !== "boolean") invalidPolicy();
  return Object.freeze({
    timeZone: raw.timeZone,
    dailyQuotaMinutes: raw.dailyQuotaMinutes,
    windows: Object.freeze(windows),
    bedtime: normalizeBedtime(raw.bedtime),
    allowlist: normalizeAllowlist(raw.allowlist),
    paused: raw.paused === true,
  });
}

export function windowsForWeekday(policy, weekday) {
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) invalidPolicy();
  return policy.windows[weekday] ?? [];
}

/** The window containing `minutesOfDay`, or null when outside every window. */
export function activeWindow(policy, weekday, minutes) {
  return windowsForWeekday(policy, weekday)
    .find((window) => minutes >= window.startMinutes && minutes < window.endMinutes) ?? null;
}

/**
 * Start of the next window at or after `minutes` on `weekday`, searching
 * forward up to seven days. Returns { dayOffset, minutes } or null when the
 * schedule has no windows at all.
 */
export function nextWindowStart(policy, weekday, minutes) {
  for (let dayOffset = 0; dayOffset < 8; dayOffset += 1) {
    const day = (weekday + dayOffset) % 7;
    const floor = dayOffset === 0 ? minutes : 0;
    const window = windowsForWeekday(policy, day).find((entry) => entry.startMinutes >= floor);
    if (window) return Object.freeze({ dayOffset, minutes: window.startMinutes });
  }
  return null;
}

export function isBedtime(policy, minutes) {
  const { bedtime } = policy;
  if (!bedtime) return false;
  return bedtime.crossesMidnight
    ? minutes >= bedtime.startMinutes || minutes < bedtime.endMinutes
    : minutes >= bedtime.startMinutes && minutes < bedtime.endMinutes;
}

/** Minutes-of-day when the current bedtime block ends; may exceed 1440. */
export function bedtimeEnd(policy, minutes) {
  if (!isBedtime(policy, minutes)) return null;
  const { bedtime } = policy;
  if (!bedtime.crossesMidnight) return bedtime.endMinutes;
  return minutes >= bedtime.startMinutes
    ? bedtime.endMinutes + MINUTES_PER_DAY
    : bedtime.endMinutes;
}

/** Next minutes-of-day at which bedtime starts, relative to `minutes`. */
export function bedtimeStartAfter(policy, minutes) {
  const { bedtime } = policy;
  if (!bedtime) return null;
  return minutes < bedtime.startMinutes
    ? bedtime.startMinutes
    : bedtime.startMinutes + MINUTES_PER_DAY;
}

/** Total minutes a child could use on a weekday if quota were unlimited. */
export function scheduledMinutes(policy, weekday) {
  return windowsForWeekday(policy, weekday)
    .reduce((total, window) => total + (window.endMinutes - window.startMinutes), 0);
}
