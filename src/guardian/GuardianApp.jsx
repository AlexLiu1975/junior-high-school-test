import { useCallback, useEffect, useMemo, useState } from "react";
import { createGuardianApi, describeError } from "./guardianApi.js";
import ScheduleEditor from "./ScheduleEditor.jsx";
import {
  CategoryBreakdown,
  DailyUsageChart,
  HourlyHeatStrip,
  TopAppsChart,
  UsageTable,
} from "./UsageCharts.jsx";
import {
  STATE_LABELS,
  describeState,
  formatClock,
  formatDateTime,
  formatMinutes,
  formatRelative,
  toneClasses,
} from "./format.js";

const TABS = [
  { id: "overview", label: "總覽" },
  { id: "usage", label: "使用明細" },
  { id: "schedule", label: "時段設定" },
  { id: "requests", label: "延長申請" },
  { id: "devices", label: "裝置" },
];

const RANGE_OPTIONS = [
  { days: 7, label: "近 7 天" },
  { days: 14, label: "近 14 天" },
  { days: 30, label: "近 30 天" },
];

function StatusPill({ state }) {
  const label = STATE_LABELS[state.reason] ?? { title: state.reason, tone: "neutral" };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${toneClasses(label.tone)}`}>
      <span aria-hidden="true">{state.locked ? "🔒" : "✅"}</span>
      {label.title}
    </span>
  );
}

function StatTile({ label, value, hint }) {
  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function TimelineStrip({ timeline, state, timeZone }) {
  if (timeline.length === 0) {
    return <p className="text-xs text-slate-500">今天沒有設定可用時段，手機全天鎖定。</p>;
  }
  return (
    <div className="guardian-viz">
      <div className="relative h-6 w-full overflow-hidden rounded-md" style={{ backgroundColor: "var(--viz-grid)" }}>
        {timeline.map((window) => {
          const [hours, minutes] = window.start.split(":").map(Number);
          const startOfDayMinutes = hours * 60 + minutes;
          return (
            <div
              key={window.start}
              className="absolute top-0 h-full rounded-sm"
              style={{
                left: `${(startOfDayMinutes / 1440) * 100}%`,
                width: `${(window.minutes / 1440) * 100}%`,
                backgroundColor: "var(--viz-series-1)",
              }}
              title={`${window.start}–${window.end}`}
            />
          );
        })}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-600">
        {timeline.map((window) => (
          <span key={window.start}>{window.start}–{window.end}</span>
        ))}
        {state.lockAtMs && !state.locked ? (
          <span className="font-medium text-sky-700">
            {formatClock(state.lockAtMs, timeZone)} 自動鎖定
          </span>
        ) : null}
      </div>
    </div>
  );
}

function ChildHeader({ card, timeZone, onLock, onUnlock, busy }) {
  const [unlockMinutes, setUnlockMinutes] = useState(30);
  const locked = card.state.locked;

  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-white p-5 ring-1 ring-slate-200 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        <span
          className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold text-white"
          style={{ backgroundColor: card.avatarColor ?? "#2a78d6" }}
        >
          {card.displayName.slice(0, 1)}
        </span>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900">{card.displayName}</h2>
            <StatusPill state={card.state} />
          </div>
          <p className="mt-0.5 text-sm text-slate-600">{describeState(card.state, timeZone)}</p>
          <p className="text-xs text-slate-500">
            今日已使用 {formatMinutes(card.today.totalMinutes)} / 上限 {formatMinutes(card.state.quotaMinutes)}
            {card.state.bonusMinutes > 0 ? `（含加時 ${formatMinutes(card.state.bonusMinutes)}）` : ""}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {locked && card.state.reason === "manual-lock" ? (
          <>
            <select
              value={unlockMinutes}
              onChange={(event) => setUnlockMinutes(Number(event.target.value))}
              className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
              aria-label="開放時間長度"
            >
              {[15, 30, 60, 120].map((minutes) => (
                <option key={minutes} value={minutes}>{minutes} 分鐘</option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy}
              onClick={() => onUnlock(unlockMinutes)}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              解除鎖定
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={onLock}
            className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            🔒 一鍵鎖定
          </button>
        )}
      </div>
    </div>
  );
}

function OverviewTab({ card, timeZone }) {
  const overDays = card.compliance.filter((day) => !day.withinQuota).length;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="今日使用"
          value={formatMinutes(card.today.totalMinutes)}
          hint={`還可以用 ${formatMinutes(card.remainingMinutesToday)}`}
        />
        <StatTile
          label="平均每日"
          value={formatMinutes(card.range.averageMinutes)}
          hint={card.range.trendPercent === null
            ? `近 ${card.range.dayCount} 天`
            : `較前期 ${card.range.trendPercent >= 0 ? "增加" : "減少"} ${Math.abs(card.range.trendPercent)}%`}
        />
        <StatTile
          label="最長單次使用"
          value={formatMinutes(card.today.longestSessionMinutes)}
          hint="今日"
        />
        <StatTile
          label="超出上限天數"
          value={`${overDays} 天`}
          hint={`近 ${card.range.dayCount} 天`}
        />
      </div>

      <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h3 className="mb-2 text-sm font-semibold text-slate-800">今天的可用時段</h3>
        <TimelineStrip timeline={card.timeline} state={card.state} timeZone={timeZone} />
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <DailyUsageChart series={card.range.series} quotaMinutes={card.policy.dailyQuotaMinutes} />
        </section>
        <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <HourlyHeatStrip hourly={card.today.hourly} />
          <div className="mt-5">
            <CategoryBreakdown byCategory={card.today.byCategory} totalMinutes={card.today.totalMinutes} />
          </div>
        </section>
      </div>
    </div>
  );
}

function UsageTab({ card, days, onDaysChange }) {
  const [showTable, setShowTable] = useState(false);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-600">期間</span>
        {RANGE_OPTIONS.map((option) => (
          <button
            key={option.days}
            type="button"
            onClick={() => onDaysChange(option.days)}
            className={days === option.days
              ? "rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
              : "rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"}
          >
            {option.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowTable((current) => !current)}
          className="ml-auto rounded-lg px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-50"
        >
          {showTable ? "顯示圖表" : "顯示表格"}
        </button>
      </div>

      <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        {showTable
          ? <UsageTable series={card.range.series} quotaMinutes={card.policy.dailyQuotaMinutes} />
          : <DailyUsageChart series={card.range.series} quotaMinutes={card.policy.dailyQuotaMinutes} />}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <TopAppsChart apps={card.range.topApps} />
        </section>
        <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <HourlyHeatStrip hourly={card.today.hourly} />
          <dl className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-600">
            <div>
              <dt className="text-slate-500">最早使用</dt>
              <dd className="font-medium text-slate-800">
                {card.today.firstUseMs ? formatClock(card.today.firstUseMs, card.policy.timeZone) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">最晚使用</dt>
              <dd className="font-medium text-slate-800">
                {card.today.lastUseMs ? formatClock(card.today.lastUseMs, card.policy.timeZone) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">今日開啟次數</dt>
              <dd className="font-medium text-slate-800">{card.today.sessionCount} 次</dd>
            </div>
            <div>
              <dt className="text-slate-500">期間總計</dt>
              <dd className="font-medium text-slate-800">{formatMinutes(card.range.totalMinutes)}</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}

function RequestsTab({ card, timeZone, onDecide, busy }) {
  const [minutesById, setMinutesById] = useState({});
  if (card.pendingRequests.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center ring-1 ring-slate-200">
        <p className="text-sm text-slate-600">目前沒有待處理的延長申請。</p>
        <p className="mt-1 text-xs text-slate-500">小孩在手機上提出申請後，會即時出現在這裡。</p>
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {card.pendingRequests.map((request) => {
        const granted = minutesById[request.requestId] ?? request.minutes;
        return (
          <li key={request.requestId} className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {card.displayName} 想延長 {formatMinutes(request.minutes)}
                </p>
                {request.reason ? (
                  <p className="mt-1 text-sm text-slate-600">「{request.reason}」</p>
                ) : null}
                <p className="mt-1 text-xs text-slate-500">
                  {formatDateTime(request.createdAtMs, timeZone)} 提出 ·
                  {" "}{formatDateTime(request.expiresAtMs, timeZone)} 前有效
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={granted}
                  onChange={(event) => setMinutesById((current) => ({
                    ...current,
                    [request.requestId]: Number(event.target.value),
                  }))}
                  className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
                  aria-label="核准時間"
                >
                  {[5, 10, 15, 30, 45, 60].map((minutes) => (
                    <option key={minutes} value={minutes}>核准 {minutes} 分鐘</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onDecide(request.requestId, "approved", { grantedMinutes: granted })}
                  className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  同意
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onDecide(request.requestId, "denied")}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
                >
                  婉拒
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function DevicesTab({ card, timeZone, nowMs, api, onChanged, busy }) {
  const [pairing, setPairing] = useState(null);
  const [error, setError] = useState("");

  const createCode = async () => {
    setError("");
    try {
      setPairing(await api.createPairingCode(card.childId));
    } catch (codeError) {
      setError(describeError(codeError));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h3 className="text-sm font-semibold text-slate-800">已連結的裝置</h3>
        <ul className="mt-3 flex flex-col gap-2">
          {card.devices.length === 0 ? (
            <li className="text-sm text-slate-500">尚未連結任何裝置。</li>
          ) : null}
          {card.devices.map((device) => (
            <li key={device.deviceId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
              <div className="text-sm">
                <span className="font-medium text-slate-800">
                  {device.platform === "ios" ? "iPhone / iPad" : "Android 手機"}
                </span>
                <span className="ml-2 text-xs text-slate-500">
                  {device.online ? "● 連線中" : `最後回報 ${formatRelative(device.lastSeenAtMs, nowMs)}`}
                </span>
                {device.override?.type === "lock" ? (
                  <span className="ml-2 text-xs font-semibold text-rose-700">已鎖定</span>
                ) : null}
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={async () => { await api.revokeDevice(device.deviceId); onChanged(); }}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-rose-300 hover:text-rose-700 disabled:opacity-50"
              >
                解除連結
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h3 className="text-sm font-semibold text-slate-800">連結新裝置</h3>
        <p className="mt-1 text-xs text-slate-500">
          在小孩的手機安裝「守護時間」App，選擇「我是小孩」，輸入下面的配對碼即可完成連結。配對碼 15 分鐘內有效，且只能使用一次。
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={createCode}
            className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white"
          >
            產生配對碼
          </button>
          {pairing ? (
            <span className="rounded-lg bg-slate-900 px-4 py-2 font-mono text-xl tracking-[0.3em] text-white">
              {pairing.code}
            </span>
          ) : null}
          {pairing ? (
            <span className="text-xs text-slate-500">
              {formatDateTime(pairing.expiresAtMs, timeZone)} 前輸入
            </span>
          ) : null}
        </div>
        {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
      </section>
    </div>
  );
}

export default function GuardianApp() {
  const forceDemo = new URLSearchParams(window.location.search).get("demo") === "1";
  const api = useMemo(() => createGuardianApi({ forceDemo }), [forceDemo]);
  const [dashboard, setDashboard] = useState(null);
  const [selectedChildId, setSelectedChildId] = useState(null);
  const [tab, setTab] = useState("overview");
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async (nextDays = days) => {
    try {
      const data = await api.loadDashboard(nextDays);
      setDashboard(data);
      setSelectedChildId((current) => current ?? data.children[0]?.childId ?? null);
      setError("");
    } catch (loadError) {
      setError(describeError(loadError));
    } finally {
      setLoading(false);
    }
  }, [api, days]);

  useEffect(() => { refresh(days); }, [refresh, days]);

  // Keep the countdown honest: the verdict is time-dependent, so re-read it.
  useEffect(() => {
    const timer = setInterval(() => { refresh(days); }, 60000);
    return () => clearInterval(timer);
  }, [refresh, days]);

  const card = dashboard?.children.find((child) => child.childId === selectedChildId)
    ?? dashboard?.children[0]
    ?? null;
  const timeZone = card?.policy.timeZone ?? "Asia/Taipei";

  const act = async (operation) => {
    setBusy(true);
    setError("");
    try {
      await operation();
      await refresh(days);
    } catch (actionError) {
      setError(describeError(actionError));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <main className="p-10 text-center text-slate-500">載入中…</main>;
  }

  if (!card) {
    return (
      <main className="p-10 text-center">
        <p className="text-slate-600">這個帳號還沒有建立家庭資料。</p>
        {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl bg-slate-50 px-4 py-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">守護時間 · 家長後台</h1>
          <p className="text-xs text-slate-500">
            {dashboard.familyName ?? "我的家庭"} ·
            {" "}{formatDateTime(dashboard.generatedAtMs, timeZone)} 更新
            {api.mode === "demo" ? " · 示範模式（資料僅存在瀏覽器）" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dashboard.children.map((child) => (
            <button
              key={child.childId}
              type="button"
              onClick={() => setSelectedChildId(child.childId)}
              className={child.childId === card.childId
                ? "rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
                : "rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-600 ring-1 ring-slate-200"}
            >
              {child.displayName}
              {child.pendingRequests.length > 0 ? (
                <span className="ml-1.5 rounded-full bg-amber-400 px-1.5 text-xs text-slate-900">
                  {child.pendingRequests.length}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </header>

      {dashboard.undeliveredCommands.length > 0 ? (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
          有 {dashboard.undeliveredCommands.length} 個指令尚未送達小孩的手機，可能是手機離線或未開啟 App。
        </p>
      ) : null}
      {error ? (
        <p className="mb-4 rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700 ring-1 ring-rose-200">{error}</p>
      ) : null}

      <ChildHeader
        card={card}
        timeZone={timeZone}
        busy={busy}
        onLock={() => act(() => api.issueCommand(card.devices[0]?.deviceId, "lock"))}
        onUnlock={(minutes) => act(() => api.issueCommand(card.devices[0]?.deviceId, "unlock", { minutes }))}
      />

      <nav className="my-5 flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            className={tab === entry.id
              ? "-mb-px border-b-2 border-sky-700 px-4 py-2 text-sm font-semibold text-sky-800"
              : "px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-800"}
          >
            {entry.label}
            {entry.id === "requests" && card.pendingRequests.length > 0 ? (
              <span className="ml-1.5 rounded-full bg-amber-400 px-1.5 text-xs text-slate-900">
                {card.pendingRequests.length}
              </span>
            ) : null}
          </button>
        ))}
      </nav>

      {tab === "overview" ? <OverviewTab card={card} timeZone={timeZone} /> : null}
      {tab === "usage" ? <UsageTab card={card} days={days} onDaysChange={setDays} /> : null}
      {tab === "schedule" ? (
        <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <ScheduleEditor
            key={card.childId}
            policy={card.policy}
            saving={busy}
            onSave={(policy) => act(() => api.updatePolicy(card.childId, policy))}
          />
        </section>
      ) : null}
      {tab === "requests" ? (
        <RequestsTab
          card={card}
          timeZone={timeZone}
          busy={busy}
          onDecide={(requestId, decision, options) =>
            act(() => api.decideRequest(requestId, decision, options))}
        />
      ) : null}
      {tab === "devices" ? (
        <DevicesTab
          card={card}
          timeZone={timeZone}
          nowMs={dashboard.generatedAtMs}
          api={api}
          busy={busy}
          onChanged={() => refresh(days)}
        />
      ) : null}

      <footer className="mt-8 border-t border-slate-200 pt-4 text-xs text-slate-500">
        <p>
          孩子的手機上會顯示相同的規則與剩餘時間；緊急電話與家長設定的白名單 App 不受鎖定影響。
        </p>
      </footer>
    </main>
  );
}
