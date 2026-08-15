import { useMemo, useState } from "react";
import { normalizePolicy } from "../../guardian/domain/schedule.js";
import { WEEKDAY_LABELS, formatMinutes } from "./format.js";

const PRESETS = [
  {
    name: "上學日早晨一小時",
    description: "週一到週五 06:00–07:00，每天上限 1 小時",
    build: (base) => ({
      ...base,
      dailyQuotaMinutes: 60,
      windows: {
        0: [{ start: "09:00", end: "11:00" }],
        1: [{ start: "06:00", end: "07:00" }],
        2: [{ start: "06:00", end: "07:00" }],
        3: [{ start: "06:00", end: "07:00" }],
        4: [{ start: "06:00", end: "07:00" }],
        5: [{ start: "06:00", end: "07:00" }],
        6: [{ start: "09:00", end: "11:00" }],
      },
    }),
  },
  {
    name: "放學後與週末",
    description: "平日 19:00–20:00、週末 09:00–11:00，每天上限 90 分",
    build: (base) => ({
      ...base,
      dailyQuotaMinutes: 90,
      windows: {
        0: [{ start: "09:00", end: "11:00" }, { start: "15:00", end: "17:00" }],
        1: [{ start: "19:00", end: "20:00" }],
        2: [{ start: "19:00", end: "20:00" }],
        3: [{ start: "19:00", end: "20:00" }],
        4: [{ start: "19:00", end: "20:00" }],
        5: [{ start: "19:00", end: "21:00" }],
        6: [{ start: "09:00", end: "11:00" }, { start: "15:00", end: "17:00" }],
      },
    }),
  },
  {
    name: "考試週",
    description: "只留週末各一小時，平日全部關閉",
    build: (base) => ({
      ...base,
      dailyQuotaMinutes: 60,
      windows: {
        0: [{ start: "10:00", end: "11:00" }],
        6: [{ start: "10:00", end: "11:00" }],
      },
    }),
  },
];

/** Strips the derived minute fields so the form edits plain wall-clock text. */
function toEditable(policy) {
  return {
    timeZone: policy.timeZone,
    dailyQuotaMinutes: policy.dailyQuotaMinutes,
    windows: Object.fromEntries(
      Array.from({ length: 7 }, (_, weekday) => [
        weekday,
        (policy.windows[weekday] ?? []).map((window) => ({ start: window.start, end: window.end })),
      ]),
    ),
    bedtime: policy.bedtime
      ? { start: policy.bedtime.start, end: policy.bedtime.end }
      : null,
    allowlist: [...(policy.allowlist ?? [])],
    paused: policy.paused === true,
  };
}

const inputClass = "rounded-md border border-slate-300 px-2 py-1 text-sm";

export default function ScheduleEditor({ policy, onSave, saving }) {
  const [draft, setDraft] = useState(() => toEditable(policy));
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const validation = useMemo(() => {
    try {
      normalizePolicy(draft);
      return { valid: true, total: null };
    } catch {
      return { valid: false };
    }
  }, [draft]);

  const update = (changes) => {
    setDraft((current) => ({ ...current, ...changes }));
    setSaved(false);
    setError("");
  };

  const updateWindow = (weekday, index, field, value) => {
    const windows = draft.windows[weekday].map((window, position) =>
      position === index ? { ...window, [field]: value } : window);
    update({ windows: { ...draft.windows, [weekday]: windows } });
  };

  const addWindow = (weekday) => {
    update({
      windows: {
        ...draft.windows,
        [weekday]: [...draft.windows[weekday], { start: "19:00", end: "20:00" }],
      },
    });
  };

  const removeWindow = (weekday, index) => {
    update({
      windows: {
        ...draft.windows,
        [weekday]: draft.windows[weekday].filter((_, position) => position !== index),
      },
    });
  };

  const copyToWeekdays = (weekday) => {
    const source = draft.windows[weekday];
    const windows = { ...draft.windows };
    for (let day = 1; day <= 5; day += 1) {
      windows[day] = source.map((window) => ({ ...window }));
    }
    update({ windows });
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    try {
      normalizePolicy(draft);
    } catch {
      setError("時段設定有誤：同一天的時段不可重疊，且結束時間必須晚於開始時間。跨過午夜請拆成兩段。");
      return;
    }
    try {
      await onSave(draft);
      setSaved(true);
    } catch (saveError) {
      setError(saveError.message);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <section>
        <h3 className="mb-2 text-sm font-semibold text-slate-800">常用範本</h3>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() => { setDraft((current) => toEditable(normalizePolicy(preset.build(current)))); setSaved(false); }}
              className="rounded-lg border border-slate-200 px-3 py-2 text-left text-xs hover:border-sky-400 hover:bg-sky-50"
            >
              <span className="block font-semibold text-slate-800">{preset.name}</span>
              <span className="block text-slate-500">{preset.description}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold text-slate-800">每日可用總時間（分鐘）</span>
          <input
            type="number"
            min="0"
            max="1440"
            step="5"
            value={draft.dailyQuotaMinutes}
            onChange={(event) => update({ dailyQuotaMinutes: Number(event.target.value) })}
            className={`${inputClass} w-32`}
          />
          <span className="text-xs text-slate-500">
            目前為 {formatMinutes(draft.dailyQuotaMinutes)}；即使在可用時段內，用完就會鎖定
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold text-slate-800">就寢鎖定</span>
          <span className="flex items-center gap-2">
            <input
              type="time"
              value={draft.bedtime?.start ?? "22:00"}
              disabled={!draft.bedtime}
              onChange={(event) => update({ bedtime: { ...draft.bedtime, start: event.target.value } })}
              className={inputClass}
            />
            <span className="text-slate-500">到</span>
            <input
              type="time"
              value={draft.bedtime?.end ?? "06:00"}
              disabled={!draft.bedtime}
              onChange={(event) => update({ bedtime: { ...draft.bedtime, end: event.target.value } })}
              className={inputClass}
            />
          </span>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={draft.bedtime !== null}
              onChange={(event) => update({
                bedtime: event.target.checked ? { start: "22:00", end: "06:00" } : null,
              })}
            />
            啟用就寢時間（優先於所有可用時段）
          </label>
        </label>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={draft.paused}
            onChange={(event) => update({ paused: event.target.checked })}
          />
          暫停管制（例如放假、生病）
        </label>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-slate-800">每週可用時段</h3>
        <div className="flex flex-col gap-2">
          {WEEKDAY_LABELS.map((label, weekday) => (
            <div key={label} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
              <span className="w-12 text-sm font-medium text-slate-700">{label}</span>
              {draft.windows[weekday].length === 0 ? (
                <span className="text-xs text-slate-400">整天不可使用</span>
              ) : null}
              {draft.windows[weekday].map((window, index) => (
                <span key={index} className="flex items-center gap-1">
                  <input
                    type="time"
                    value={window.start}
                    onChange={(event) => updateWindow(weekday, index, "start", event.target.value)}
                    className={inputClass}
                  />
                  <span className="text-slate-400">–</span>
                  <input
                    type="time"
                    value={window.end}
                    onChange={(event) => updateWindow(weekday, index, "end", event.target.value)}
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => removeWindow(weekday, index)}
                    className="rounded px-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    aria-label={`刪除 ${label} 第 ${index + 1} 個時段`}
                  >
                    ×
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={() => addWindow(weekday)}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-white"
              >
                ＋ 新增時段
              </button>
              {weekday >= 1 && weekday <= 5 ? (
                <button
                  type="button"
                  onClick={() => copyToWeekdays(weekday)}
                  className="text-xs text-sky-700 hover:underline"
                >
                  套用到週一～週五
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      {error ? <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {saved ? <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">已儲存，小孩的手機會在下次同步時套用。</p> : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving || !validation.valid}
          className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "儲存中…" : "儲存設定"}
        </button>
        <button
          type="button"
          onClick={() => { setDraft(toEditable(policy)); setError(""); setSaved(false); }}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
        >
          復原
        </button>
        {!validation.valid ? (
          <span className="text-xs text-rose-600">目前的設定無法儲存，請檢查時段是否重疊。</span>
        ) : null}
      </div>
    </form>
  );
}
