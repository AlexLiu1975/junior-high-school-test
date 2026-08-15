import { useState } from "react";
import {
  CATEGORY_LABELS,
  CATEGORY_SLOT,
  formatDayLabel,
  formatMinutes,
} from "./format.js";

const SEQ_STEPS = ["--viz-seq-100", "--viz-seq-200", "--viz-seq-300", "--viz-seq-400", "--viz-seq-500", "--viz-seq-600"];

function Tooltip({ content }) {
  if (!content) return null;
  return (
    <div className="pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white shadow-lg">
      {content}
    </div>
  );
}

/**
 * Daily screen time over the selected range. One series, so no legend — the
 * heading names it. The dashed rule is the daily allowance, which is what makes
 * a bar meaningful rather than just tall.
 */
export function DailyUsageChart({ series, quotaMinutes }) {
  const [hovered, setHovered] = useState(null);
  const peak = Math.max(quotaMinutes, ...series.map((day) => day.minutes), 1);
  const domain = Math.ceil(peak / 30) * 30;
  const busiest = series.reduce(
    (best, day) => (best === null || day.minutes > best.minutes ? day : best),
    null,
  );

  return (
    <figure className="guardian-viz m-0">
      <figcaption className="mb-1 text-sm font-semibold text-slate-800">每日使用時間</figcaption>
      <p className="mb-3 text-xs text-slate-500">
        虛線為每日可用時間上限 {formatMinutes(quotaMinutes)}
      </p>
      <div className="relative flex h-44 items-end gap-1.5 border-b border-slate-200 pb-0">
        <div
          className="pointer-events-none absolute inset-x-0 border-t border-dashed"
          style={{
            bottom: `${(quotaMinutes / domain) * 100}%`,
            borderColor: "var(--viz-series-2)",
          }}
        />
        {series.map((day) => {
          const height = domain > 0 ? (day.minutes / domain) * 100 : 0;
          const isHovered = hovered === day.dateKey;
          return (
            <div
              key={day.dateKey}
              className="relative flex h-full flex-1 flex-col justify-end"
              onMouseEnter={() => setHovered(day.dateKey)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(day.dateKey)}
              onBlur={() => setHovered(null)}
              tabIndex={0}
            >
              {isHovered ? (
                <Tooltip content={`${formatDayLabel(day.dateKey)}　${formatMinutes(day.minutes)}`} />
              ) : null}
              {day.dateKey === busiest?.dateKey && day.minutes > 0 ? (
                <span className="mb-1 text-center text-[10px] font-semibold text-slate-600">
                  {formatMinutes(day.minutes)}
                </span>
              ) : null}
              <div
                className="w-full rounded-t"
                style={{
                  height: `${Math.max(height, day.minutes > 0 ? 2 : 0)}%`,
                  backgroundColor: "var(--viz-series-1)",
                  opacity: isHovered ? 1 : 0.9,
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1.5">
        {series.map((day) => (
          <div key={day.dateKey} className="flex-1 text-center text-[10px] text-slate-500">
            {day.dateKey.slice(5).replace("-", "/")}
          </div>
        ))}
      </div>
    </figure>
  );
}

/**
 * When during the day the phone was used. Magnitude on a single hue, light to
 * dark, with the scale spelled out beside it.
 */
export function HourlyHeatStrip({ hourly }) {
  const [hovered, setHovered] = useState(null);
  const peak = Math.max(...hourly, 1);

  const stepFor = (minutes) => {
    if (minutes <= 0) return null;
    const index = Math.min(SEQ_STEPS.length - 1, Math.floor((minutes / peak) * SEQ_STEPS.length));
    return SEQ_STEPS[index];
  };

  return (
    <figure className="guardian-viz m-0">
      <figcaption className="mb-1 text-sm font-semibold text-slate-800">今日使用時段分布</figcaption>
      <div className="relative flex gap-[2px]">
        {hourly.map((minutes, hour) => {
          const step = stepFor(minutes);
          return (
            <div
              key={hour}
              className="relative h-8 flex-1 rounded-sm"
              style={{
                backgroundColor: step ? `var(${step})` : "var(--viz-grid)",
              }}
              onMouseEnter={() => setHovered(hour)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(hour)}
              onBlur={() => setHovered(null)}
              tabIndex={0}
            >
              {hovered === hour ? (
                <Tooltip content={`${String(hour).padStart(2, "0")}:00　${formatMinutes(minutes)}`} />
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-500">
        <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
      </div>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
        <span>少</span>
        {SEQ_STEPS.map((step) => (
          <span
            key={step}
            className="h-3 w-5 rounded-sm"
            style={{ backgroundColor: `var(${step})` }}
          />
        ))}
        <span>多</span>
      </div>
    </figure>
  );
}

/**
 * Category split as one stacked bar. Every segment carries a visible label, so
 * identity never rests on colour alone.
 */
export function CategoryBreakdown({ byCategory, totalMinutes }) {
  const [hovered, setHovered] = useState(null);
  if (totalMinutes <= 0) {
    return <p className="text-sm text-slate-500">今天還沒有使用紀錄。</p>;
  }
  const ordered = [...byCategory]
    .sort((left, right) => CATEGORY_SLOT[left.key] - CATEGORY_SLOT[right.key]);

  return (
    <figure className="guardian-viz m-0">
      <figcaption className="mb-2 text-sm font-semibold text-slate-800">使用類型佔比</figcaption>
      <div className="relative flex h-6 gap-[2px] overflow-hidden">
        {ordered.map((entry) => (
          <div
            key={entry.key}
            className="relative h-full rounded-sm"
            style={{
              width: `${entry.share}%`,
              backgroundColor: `var(--viz-series-${CATEGORY_SLOT[entry.key]})`,
            }}
            onMouseEnter={() => setHovered(entry.key)}
            onMouseLeave={() => setHovered(null)}
          >
            {hovered === entry.key ? (
              <Tooltip content={`${CATEGORY_LABELS[entry.key]}　${formatMinutes(entry.minutes)}`} />
            ) : null}
          </div>
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {ordered.map((entry) => (
          <li key={entry.key} className="flex items-center gap-1.5 text-xs text-slate-600">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: `var(--viz-series-${CATEGORY_SLOT[entry.key]})` }}
            />
            <span>{CATEGORY_LABELS[entry.key] ?? entry.key}</span>
            <span className="font-medium text-slate-800">{formatMinutes(entry.minutes)}</span>
            <span className="text-slate-400">{entry.share}%</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** Ranked apps — one measure, so one hue, with every bar directly labelled. */
export function TopAppsChart({ apps, limit = 6 }) {
  const shown = apps.slice(0, limit);
  if (shown.length === 0) {
    return <p className="text-sm text-slate-500">這段期間沒有使用紀錄。</p>;
  }
  const peak = Math.max(...shown.map((app) => app.minutes), 1);

  return (
    <figure className="guardian-viz m-0">
      <figcaption className="mb-2 text-sm font-semibold text-slate-800">最常使用的 App</figcaption>
      <ul className="flex flex-col gap-2">
        {shown.map((app) => (
          <li key={app.key} className="flex items-center gap-3 text-xs">
            <span className="w-20 shrink-0 truncate text-slate-700" title={app.label}>{app.label}</span>
            <span className="flex h-4 flex-1 items-center">
              <span
                className="h-full rounded-r"
                style={{
                  width: `${Math.max((app.minutes / peak) * 100, 1)}%`,
                  backgroundColor: "var(--viz-series-1)",
                }}
              />
            </span>
            <span className="w-24 shrink-0 text-right font-medium text-slate-700">
              {formatMinutes(app.minutes)}
              <span className="ml-1 text-slate-400">{app.share}%</span>
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** The table view every chart falls back to — also the accessible reading. */
export function UsageTable({ series, quotaMinutes }) {
  return (
    <table className="w-full text-left text-xs">
      <caption className="sr-only">每日使用時間與可用上限</caption>
      <thead>
        <tr className="text-slate-500">
          <th scope="col" className="py-1 font-medium">日期</th>
          <th scope="col" className="py-1 font-medium">使用時間</th>
          <th scope="col" className="py-1 font-medium">上限</th>
          <th scope="col" className="py-1 font-medium">狀態</th>
        </tr>
      </thead>
      <tbody>
        {series.map((day) => (
          <tr key={day.dateKey} className="border-t border-slate-100">
            <td className="py-1 text-slate-700">{formatDayLabel(day.dateKey)}</td>
            <td className="py-1 text-slate-700">{formatMinutes(day.minutes)}</td>
            <td className="py-1 text-slate-500">{formatMinutes(quotaMinutes)}</td>
            <td className="py-1">
              {day.minutes > quotaMinutes
                ? <span className="text-rose-700">超出 {formatMinutes(day.minutes - quotaMinutes)}</span>
                : <span className="text-emerald-700">在範圍內</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
