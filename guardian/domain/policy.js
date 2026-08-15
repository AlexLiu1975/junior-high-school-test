import { isOverrideActive, pruneOverride } from "./commands.js";
import {
  activeWindow,
  bedtimeEnd,
  bedtimeStartAfter,
  isBedtime,
  nextWindowStart,
} from "./schedule.js";
import {
  MS_PER_MINUTE,
  addLocalDays,
  instantAtLocalMinutes,
  isInstant,
  localParts,
  startOfLocalDay,
} from "./time.js";

export const LOCK_REASONS = Object.freeze([
  "manual-lock",
  "bedtime",
  "outside-window",
  "quota-exhausted",
]);

export const ALLOW_REASONS = Object.freeze([
  "allowed",
  "manual-unlock",
  "paused",
]);

function invalidEvaluation() {
  throw new Error("invalid-policy-evaluation");
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function instantFor(nowMs, timeZone, dayOffset, minutes) {
  const dayAnchor = dayOffset === 0 ? nowMs : addLocalDays(nowMs, timeZone, dayOffset);
  return instantAtLocalMinutes(dayAnchor, timeZone, minutes);
}

function nextWindowInstant(policy, nowMs, { fromNextDay = false } = {}) {
  const { timeZone } = policy;
  const anchor = fromNextDay ? addLocalDays(nowMs, timeZone, 1) : nowMs;
  const parts = localParts(anchor, timeZone);
  const search = nextWindowStart(policy, parts.weekday, fromNextDay ? 0 : parts.minutesOfDay);
  if (!search) return null;
  const dayAnchor = search.dayOffset === 0 ? anchor : addLocalDays(anchor, timeZone, search.dayOffset);
  return instantAtLocalMinutes(dayAnchor, timeZone, search.minutes);
}

function locked(reason, fields) {
  return Object.freeze({
    locked: true,
    reason,
    lockUntilMs: null,
    nextUnlockAtMs: null,
    lockAtMs: null,
    ...fields,
  });
}

/**
 * Decides whether a device may be used right now, and until when.
 *
 * This is the single source of truth shared by the device client (which locks
 * the screen locally, so it keeps working offline) and the parent dashboard
 * (which previews the same verdict). Precedence, highest first:
 *   1. parent's manual lock — an explicit override outranks every schedule
 *   2. parent's pause — management temporarily suspended (holidays, illness)
 *   3. parent's temporary unlock — bounded bypass of schedule and quota
 *   4. bedtime block
 *   5. allowed-window check
 *   6. daily quota (base minutes plus approved extension bonuses)
 */
export function evaluateDeviceState({
  policy,
  usedMinutes = 0,
  bonusMinutes = 0,
  override = null,
  nowMs,
}) {
  if (!isRecord(policy) || !isRecord(policy.windows)) invalidEvaluation();
  if (!isInstant(nowMs)) invalidEvaluation();
  if (!Number.isFinite(usedMinutes) || usedMinutes < 0) invalidEvaluation();
  if (!Number.isInteger(bonusMinutes) || bonusMinutes < 0) invalidEvaluation();

  const { timeZone } = policy;
  const parts = localParts(nowMs, timeZone);
  const quotaMinutes = policy.dailyQuotaMinutes + bonusMinutes;
  const remainingQuotaMinutes = Math.max(0, quotaMinutes - usedMinutes);
  const base = {
    dateKey: parts.dateKey,
    quotaMinutes,
    usedMinutes,
    bonusMinutes,
    remainingMinutes: remainingQuotaMinutes,
    allowlist: policy.allowlist ?? [],
    evaluatedAtMs: nowMs,
  };

  const activeOverride = pruneOverride(override, nowMs);

  if (activeOverride?.type === "lock") {
    return locked("manual-lock", { ...base, remainingMinutes: 0, overrideCommandId: activeOverride.commandId });
  }

  if (policy.paused === true) {
    return Object.freeze({
      locked: false,
      reason: "paused",
      lockAtMs: null,
      nextUnlockAtMs: null,
      ...base,
    });
  }

  if (activeOverride?.type === "unlock" && isOverrideActive(activeOverride, nowMs)) {
    return Object.freeze({
      locked: false,
      reason: "manual-unlock",
      lockAtMs: activeOverride.expiresAtMs,
      nextUnlockAtMs: null,
      ...base,
      remainingMinutes: Math.max(
        remainingQuotaMinutes,
        Math.ceil((activeOverride.expiresAtMs - nowMs) / MS_PER_MINUTE),
      ),
      overrideCommandId: activeOverride.commandId,
    });
  }

  if (isBedtime(policy, parts.minutesOfDay)) {
    return locked("bedtime", {
      ...base,
      nextUnlockAtMs: instantFor(nowMs, timeZone, 0, bedtimeEnd(policy, parts.minutesOfDay)),
    });
  }

  const window = activeWindow(policy, parts.weekday, parts.minutesOfDay);
  if (!window) {
    return locked("outside-window", { ...base, nextUnlockAtMs: nextWindowInstant(policy, nowMs) });
  }

  if (remainingQuotaMinutes <= 0) {
    return locked("quota-exhausted", {
      ...base,
      nextUnlockAtMs: nextWindowInstant(policy, nowMs, { fromNextDay: true }),
      quotaResetAtMs: addLocalDays(nowMs, timeZone, 1),
    });
  }

  const windowEndMs = instantFor(nowMs, timeZone, 0, window.endMinutes);
  const quotaEndMs = nowMs + remainingQuotaMinutes * MS_PER_MINUTE;
  const bedtimeStartMinutes = bedtimeStartAfter(policy, parts.minutesOfDay);
  const bedtimeStartMs = bedtimeStartMinutes === null
    ? Number.POSITIVE_INFINITY
    : instantFor(nowMs, timeZone, 0, bedtimeStartMinutes);
  const lockAtMs = Math.min(windowEndMs, quotaEndMs, bedtimeStartMs);

  return Object.freeze({
    locked: false,
    reason: "allowed",
    lockAtMs,
    nextUnlockAtMs: null,
    ...base,
    remainingMinutes: Math.min(
      remainingQuotaMinutes,
      Math.ceil((lockAtMs - nowMs) / MS_PER_MINUTE),
    ),
    windowEndsAtMs: windowEndMs,
  });
}

/**
 * Minutes of screen time still available today across all remaining windows,
 * used by the dashboard to show "還可以用 X 分鐘" without simulating the clock.
 */
export function remainingMinutesToday({ policy, usedMinutes = 0, bonusMinutes = 0, nowMs }) {
  const parts = localParts(nowMs, policy.timeZone);
  const dayEndMs = addLocalDays(nowMs, policy.timeZone, 1);
  const quotaLeft = Math.max(0, policy.dailyQuotaMinutes + bonusMinutes - usedMinutes);
  const windows = policy.windows[parts.weekday] ?? [];
  const scheduleLeft = windows.reduce((total, window) => {
    const startMs = Math.max(nowMs, instantFor(nowMs, policy.timeZone, 0, window.startMinutes));
    const endMs = Math.min(dayEndMs, instantFor(nowMs, policy.timeZone, 0, window.endMinutes));
    return total + Math.max(0, (endMs - startMs) / MS_PER_MINUTE);
  }, 0);
  return Math.floor(Math.min(quotaLeft, scheduleLeft));
}

/**
 * Timeline of lock/unlock transitions for the local day containing `nowMs`.
 * The dashboard renders this as the day strip so a parent can see the whole
 * schedule at a glance instead of a single current verdict.
 */
export function dayTimeline({ policy, nowMs }) {
  const { timeZone } = policy;
  const dayStartMs = startOfLocalDay(nowMs, timeZone);
  const parts = localParts(nowMs, timeZone);
  const windows = policy.windows[parts.weekday] ?? [];
  return Object.freeze(windows.map((window) => Object.freeze({
    start: window.start,
    end: window.end,
    startMs: instantAtLocalMinutes(dayStartMs, timeZone, window.startMinutes),
    endMs: instantAtLocalMinutes(dayStartMs, timeZone, window.endMinutes),
    minutes: window.endMinutes - window.startMinutes,
    blockedByBedtime: isBedtime(policy, window.startMinutes) || isBedtime(policy, window.endMinutes - 1),
  })));
}
