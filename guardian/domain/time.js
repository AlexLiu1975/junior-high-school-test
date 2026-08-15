const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
export const MINUTES_PER_DAY = 1440;
export const MS_PER_MINUTE = 60000;

function invalidTimeZone() {
  throw new Error("invalid-time-zone");
}

function invalidTimeOfDay() {
  throw new Error("invalid-time-of-day");
}

function invalidInstant() {
  throw new Error("invalid-instant");
}

const formatterCache = new Map();

function partsFormatter(timeZone) {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;
  let formatter;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
  } catch {
    invalidTimeZone();
  }
  formatterCache.set(timeZone, formatter);
  return formatter;
}

export function isTimeZone(value) {
  if (typeof value !== "string" || value.length === 0) return false;
  try {
    partsFormatter(value);
    return true;
  } catch {
    return false;
  }
}

const WEEKDAY_INDEX = new Map([
  ["Sun", 0],
  ["Mon", 1],
  ["Tue", 2],
  ["Wed", 3],
  ["Thu", 4],
  ["Fri", 5],
  ["Sat", 6],
]);

export function isInstant(value) {
  return Number.isFinite(value) && Number.isInteger(value) && Math.abs(value) <= 8.64e15;
}

/**
 * Wall-clock view of an instant inside a family's time zone. Everything the
 * scheduler reasons about (windows, bedtime, quota days) is local time, so all
 * time-zone handling is funnelled through this one function.
 */
export function localParts(instantMs, timeZone) {
  if (!isInstant(instantMs)) invalidInstant();
  const parts = partsFormatter(timeZone).formatToParts(new Date(instantMs));
  const lookup = {};
  for (const { type, value } of parts) lookup[type] = value;
  // ICU renders midnight as hour 24 in some locales/versions.
  const hour = Number(lookup.hour) % 24;
  const minute = Number(lookup.minute);
  return Object.freeze({
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    weekday: WEEKDAY_INDEX.get(lookup.weekday),
    hour,
    minute,
    second: Number(lookup.second),
    minutesOfDay: hour * 60 + minute,
    dateKey: `${lookup.year}-${lookup.month}-${lookup.day}`,
  });
}

export function dateKeyOf(instantMs, timeZone) {
  return localParts(instantMs, timeZone).dateKey;
}

export function isDateKey(value) {
  if (typeof value !== "string" || !DATE_KEY_PATTERN.test(value)) return false;
  const [, year, month, day] = DATE_KEY_PATTERN.exec(value);
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  if (monthNumber < 1 || monthNumber > 12 || dayNumber < 1 || dayNumber > 31) return false;
  const probe = new Date(Date.UTC(Number(year), monthNumber - 1, dayNumber));
  return probe.getUTCMonth() === monthNumber - 1 && probe.getUTCDate() === dayNumber;
}

export function isTimeOfDay(value) {
  return typeof value === "string" && TIME_OF_DAY_PATTERN.test(value);
}

export function minutesOfDay(timeOfDay) {
  if (!isTimeOfDay(timeOfDay)) invalidTimeOfDay();
  const [hours, minutes] = timeOfDay.split(":");
  return Number(hours) * 60 + Number(minutes);
}

export function formatTimeOfDay(minutes) {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > MINUTES_PER_DAY) invalidTimeOfDay();
  const normalized = minutes % MINUTES_PER_DAY;
  const hours = String(Math.floor(normalized / 60)).padStart(2, "0");
  const rest = String(normalized % 60).padStart(2, "0");
  return `${hours}:${rest}`;
}

/**
 * Instant of local midnight that starts the day containing `instantMs`.
 * Derived by subtracting the elapsed local minutes, then re-checking, which
 * keeps the result correct across daylight-saving transitions.
 */
export function startOfLocalDay(instantMs, timeZone) {
  const parts = localParts(instantMs, timeZone);
  let candidate = instantMs
    - parts.minutesOfDay * MS_PER_MINUTE
    - parts.second * 1000
    - (instantMs % 1000);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const candidateParts = localParts(candidate, timeZone);
    if (candidateParts.dateKey === parts.dateKey && candidateParts.minutesOfDay === 0) {
      return candidate;
    }
    if (candidateParts.dateKey !== parts.dateKey) {
      candidate += (MINUTES_PER_DAY - candidateParts.minutesOfDay) * MS_PER_MINUTE;
      continue;
    }
    candidate -= candidateParts.minutesOfDay * MS_PER_MINUTE;
  }
  return candidate;
}

/** Instant at `minutes` past local midnight of the day containing `instantMs`. */
export function instantAtLocalMinutes(instantMs, timeZone, minutes) {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > MINUTES_PER_DAY * 2) {
    invalidTimeOfDay();
  }
  const dayStart = startOfLocalDay(instantMs, timeZone);
  const naive = dayStart + minutes * MS_PER_MINUTE;
  // Re-align when a DST shift moved the wall clock between midnight and target.
  const target = minutes % MINUTES_PER_DAY;
  const naiveParts = localParts(naive, timeZone);
  if (minutes < MINUTES_PER_DAY && naiveParts.minutesOfDay !== target) {
    return naive + (target - naiveParts.minutesOfDay) * MS_PER_MINUTE;
  }
  return naive;
}

export function addLocalDays(instantMs, timeZone, days) {
  if (!Number.isInteger(days)) invalidInstant();
  const dayStart = startOfLocalDay(instantMs, timeZone);
  return startOfLocalDay(dayStart + days * MINUTES_PER_DAY * MS_PER_MINUTE + 12 * 60 * MS_PER_MINUTE, timeZone);
}

export function weekdayOf(instantMs, timeZone) {
  return localParts(instantMs, timeZone).weekday;
}

export function minutesBetween(startMs, endMs) {
  if (!isInstant(startMs) || !isInstant(endMs)) invalidInstant();
  return Math.max(0, (endMs - startMs) / MS_PER_MINUTE);
}
