import { addLocalDays, dateKeyOf } from "../../guardian/domain/time.js";

const LOCALE = "zh-TW";

/** Why the phone is in its current state, in the words a parent would use. */
export const STATE_LABELS = Object.freeze({
  "allowed": { title: "可以使用", tone: "good" },
  "manual-unlock": { title: "家長臨時開放", tone: "good" },
  "paused": { title: "已暫停管制", tone: "neutral" },
  "manual-lock": { title: "已被家長鎖定", tone: "critical" },
  "bedtime": { title: "就寢時間，已鎖定", tone: "serious" },
  "outside-window": { title: "非可用時段，已鎖定", tone: "serious" },
  "quota-exhausted": { title: "今日時間用完，已鎖定", tone: "warning" },
});

export const CATEGORY_LABELS = Object.freeze({
  video: "影音",
  game: "遊戲",
  social: "社群",
  study: "學習",
  tool: "工具",
  other: "其他",
});

/** Fixed category-to-slot mapping: colour follows the entity, never its rank. */
export const CATEGORY_SLOT = Object.freeze({
  video: 1,
  game: 2,
  social: 3,
  study: 4,
  tool: 5,
  other: 6,
});

export const WEEKDAY_LABELS = Object.freeze(["週日", "週一", "週二", "週三", "週四", "週五", "週六"]);

export function formatClock(instantMs, timeZone) {
  if (typeof instantMs !== "number") return "—";
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(instantMs));
}

export function formatDateTime(instantMs, timeZone) {
  if (typeof instantMs !== "number") return "—";
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(instantMs));
}

export function formatDayLabel(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return `${month}/${day}（${WEEKDAY_LABELS[date.getUTCDay()].slice(1)}）`;
}

/** Minutes as 「1 小時 20 分」 — the unit parents actually think in. */
export function formatMinutes(minutes) {
  const total = Math.max(0, Math.round(minutes));
  if (total === 0) return "0 分";
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${rest} 分`;
  if (rest === 0) return `${hours} 小時`;
  return `${hours} 小時 ${rest} 分`;
}

export function formatRelative(instantMs, nowMs) {
  if (typeof instantMs !== "number") return "從未";
  const minutes = Math.round((nowMs - instantMs) / 60000);
  if (minutes < 1) return "剛剛";
  if (minutes < 60) return `${minutes} 分鐘前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小時前`;
  return `${Math.round(hours / 24)} 天前`;
}

/**
 * "09:00" alone is ambiguous once the next window is on another day, so the
 * label carries the day whenever it is not today.
 */
function dayPrefix(instantMs, nowMs, timeZone) {
  const target = dateKeyOf(instantMs, timeZone);
  const today = dateKeyOf(nowMs, timeZone);
  if (target === today) return "";
  const tomorrow = dateKeyOf(addLocalDays(nowMs, timeZone, 1), timeZone);
  if (target === tomorrow) return "明天 ";
  const [, month, day] = target.split("-");
  return `${Number(month)}/${Number(day)} `;
}

/** One sentence describing what happens next, for the child card headline. */
export function describeState(state, timeZone) {
  if (!state) return "";
  if (state.locked) {
    if (state.reason === "manual-lock") return "需要家長手動解除鎖定";
    if (state.nextUnlockAtMs) {
      const prefix = dayPrefix(state.nextUnlockAtMs, state.evaluatedAtMs, timeZone);
      return `${prefix}${formatClock(state.nextUnlockAtMs, timeZone)} 可再使用`;
    }
    return "目前無法使用";
  }
  if (state.lockAtMs) {
    return `還可以用 ${formatMinutes(state.remainingMinutes)}，${formatClock(state.lockAtMs, timeZone)} 自動鎖定`;
  }
  return "目前不受時間限制";
}

export function toneClasses(tone) {
  switch (tone) {
    case "good":
      return "bg-emerald-50 text-emerald-800 ring-emerald-200";
    case "warning":
      return "bg-amber-50 text-amber-900 ring-amber-200";
    case "serious":
      return "bg-orange-50 text-orange-900 ring-orange-200";
    case "critical":
      return "bg-rose-50 text-rose-900 ring-rose-200";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
}
