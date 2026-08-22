import { useEffect, useMemo, useRef, useState } from "react";
import { PERIODIC_TABLE_QUIZ } from "../../../functions/shared/quizzes/03-periodic-table/periodicTableDefinition.js";
import { pauseTimer, placeElement, resumeTimer } from "./periodicTableDomain.js";
import { periodicTableAdapter } from "./periodicTableAdapter.js";

const TOTAL = PERIODIC_TABLE_QUIZ.elements.length;
const elementsById = new Map(PERIODIC_TABLE_QUIZ.elements.map((element) => [element.id, element]));

const categoryStyles = {
  "c-alkali": "border-rose-300 bg-rose-100 text-rose-950",
  "c-alkaline": "border-orange-300 bg-orange-100 text-orange-950",
  "c-transition": "border-amber-300 bg-amber-100 text-amber-950",
  "c-post": "border-lime-300 bg-lime-100 text-lime-950",
  "c-metalloid": "border-emerald-300 bg-emerald-100 text-emerald-950",
  "c-nonmetal": "border-cyan-300 bg-cyan-100 text-cyan-950",
  "c-halogen": "border-sky-300 bg-sky-100 text-sky-950",
  "c-noble": "border-indigo-300 bg-indigo-100 text-indigo-950",
  "c-lan": "border-fuchsia-300 bg-fuchsia-100 text-fuchsia-950",
  "c-act": "border-violet-300 bg-violet-100 text-violet-950",
};

function formatDuration(milliseconds) {
  const totalSeconds = Math.floor(Math.max(0, milliseconds) / 1000);
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function elapsedAt(attempt, nowMs) {
  if (!attempt) return 0;
  return attempt.timerState === "running"
    ? attempt.elapsedMs + Math.max(0, nowMs - attempt.segmentStartedAtMs)
    : attempt.elapsedMs;
}

function toDomainState(attempt) {
  return {
    elements: PERIODIC_TABLE_QUIZ.elements,
    pool: attempt.poolOrder
      .filter((id) => !Object.hasOwn(attempt.placements, id))
      .map((id) => elementsById.get(id)),
    placements: attempt.placements,
    errorCount: attempt.errorCount,
    lastAttempt: attempt.lastAttempt,
    timerState: attempt.timerState,
    elapsedMs: attempt.elapsedMs,
    segmentStartedAtMs: attempt.segmentStartedAtMs,
  };
}

function fromDomainState(attempt, domainState) {
  return {
    ...attempt,
    placements: domainState.placements,
    errorCount: domainState.errorCount,
    lastAttempt: domainState.lastAttempt,
    timerState: domainState.timerState,
    elapsedMs: domainState.elapsedMs,
    segmentStartedAtMs: domainState.segmentStartedAtMs,
  };
}

function ElementFace({ element, showNumber = false }) {
  return (
    <>
      {showNumber && <span className="absolute left-1 top-0.5 text-[8px] font-bold opacity-70">{element.atomicNumber}</span>}
      <strong className="text-sm leading-none">{element.symbol}</strong>
      <span className="truncate text-[8px] leading-tight">{element.englishName}</span>
      <span className="text-[9px] leading-tight">{element.chineseName}</span>
    </>
  );
}

function TargetCell({ element, placed, disabled, selected, onPlace }) {
  return (
    <button
      type="button"
      aria-label={placed
        ? `${element.atomicNumber} ${element.symbol} 已正確放置`
        : `原子序 ${element.atomicNumber} 的放置位置`}
      disabled={disabled || placed}
      onClick={() => onPlace(element.targetId)}
      onDragOver={(event) => {
        if (!disabled && !placed) event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        const elementId = event.dataTransfer.getData("text/plain");
        onPlace(element.targetId, elementId);
      }}
      className={`relative flex h-16 w-16 flex-col items-center justify-center rounded border text-center transition ${
        placed
          ? `${categoryStyles[element.categoryClass]} cursor-default shadow-inner`
          : selected
            ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-400"
            : "border-dashed border-slate-400 bg-white/70 hover:bg-emerald-50"
      } disabled:opacity-100`}
      style={{ gridColumn: element.column, gridRow: element.row === "main" ? element.period : 1 }}
    >
      {placed ? <ElementFace element={element} showNumber /> : <span className="text-[10px] text-slate-500">{element.atomicNumber}</span>}
    </button>
  );
}

function TableGrid({ elements, placements, disabled, selectedId, onPlace, columns = 18 }) {
  return (
    <div
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${columns}, 4rem)`, gridAutoRows: "4rem" }}
    >
      {elements.map((element) => (
        <TargetCell
          key={element.id}
          element={element}
          placed={placements[element.id] === element.targetId}
          disabled={disabled}
          selected={Boolean(selectedId)}
          onPlace={onPlace}
        />
      ))}
    </div>
  );
}

export default function PeriodicTableQuiz({ progress, sync }) {
  const restored = useRef(progress?.activeAttempt
    ? periodicTableAdapter.restoreAttempt(progress.activeAttempt)
    : null);
  const [attempt, setAttempt] = useState(restored.current);
  const attemptRef = useRef(restored.current);
  const [selectedId, setSelectedId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmedResult, setConfirmedResult] = useState(null);
  const [message, setMessage] = useState(
    restored.current ? "已還原上次進度；按「繼續」後才會重新開始計時。" : null,
  );
  const [clockNow, setClockNow] = useState(Date.now());

  const mainElements = useMemo(
    () => PERIODIC_TABLE_QUIZ.elements.filter(({ row }) => row === "main"),
    [],
  );
  const lanthanides = useMemo(
    () => PERIODIC_TABLE_QUIZ.elements.filter(({ row }) => row === "lanthanide"),
    [],
  );
  const actinides = useMemo(
    () => PERIODIC_TABLE_QUIZ.elements.filter(({ row }) => row === "actinide"),
    [],
  );

  const updateAttempt = (next) => {
    attemptRef.current = next;
    setAttempt(next);
  };

  useEffect(() => {
    if (attempt?.timerState !== "running" || confirmedResult || submitting) return undefined;
    const interval = window.setInterval(() => setClockNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [attempt?.timerState, confirmedResult, submitting]);

  useEffect(() => {
    if (attempt?.timerState !== "running" || confirmedResult || submitting) return undefined;
    const preserveRunningSnapshot = () => {
      const current = attemptRef.current;
      if (!current || current.timerState !== "running") return;
      try {
        sync.queueSave(periodicTableAdapter.serializeProgress(current, Date.now()));
      } catch (error) {
        console.error("Periodic timer snapshot could not be saved", error);
      }
    };
    const interval = window.setInterval(preserveRunningSnapshot, 5_000);
    window.addEventListener("pagehide", preserveRunningSnapshot);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("pagehide", preserveRunningSnapshot);
    };
  }, [attempt?.timerState, confirmedResult, submitting, sync]);

  useEffect(() => {
    if (typeof sync.onRecoveredSubmission !== "function") return undefined;
    return sync.onRecoveredSubmission(({ result, submission, refreshRequired }) => {
      const current = attemptRef.current;
      if (!current || submission?.attemptId !== current.attemptId) return;
      try {
        const recovered = periodicTableAdapter.restoreConfirmedSubmission({
          currentAttempt: current,
          submission,
          result,
        });
        updateAttempt(recovered.attempt);
        setConfirmedResult(recovered.result);
        setSelectedId(null);
        setMessage(refreshRequired
          ? "完成紀錄已保存；請重新整理頁面確認最新狀態。"
          : "完成紀錄已保存。");
      } catch (error) {
        console.error("Recovered periodic submission could not be displayed", error);
        setMessage("完成紀錄已保存，但結果畫面無法還原；請重新整理頁面。");
      }
    });
  }, [sync]);

  const saveAttempt = (next, nowMs = Date.now()) => {
    sync.queueSave(periodicTableAdapter.serializeProgress(next, nowMs));
  };

  const startNew = () => {
    if (submitting || confirmedResult) return;
    try {
      const nowMs = Date.now();
      const next = periodicTableAdapter.createAttempt({ nowMs });
      saveAttempt(next, nowMs);
      updateAttempt(next);
      setClockNow(nowMs);
      setSelectedId(null);
      setMessage("測驗已開始。");
    } catch (error) {
      console.error("Periodic attempt could not start", error);
      setMessage("新測驗尚未建立，請稍後重試。");
    }
  };

  const togglePause = () => {
    const current = attemptRef.current;
    if (!current || submitting || confirmedResult) return;
    const nowMs = Date.now();
    const domain = current.timerState === "running"
      ? pauseTimer(toDomainState(current), nowMs)
      : resumeTimer(toDomainState(current), nowMs);
    const next = fromDomainState(current, domain);
    try {
      saveAttempt(next, nowMs);
      updateAttempt(next);
      setClockNow(nowMs);
      setSelectedId(null);
      setMessage(next.timerState === "paused" ? "測驗已暫停，暫停期間不計時。" : "測驗已繼續。");
    } catch (error) {
      console.error("Periodic timer state could not be saved", error);
      setMessage("計時狀態尚未同步，請稍後重試。");
    }
  };

  const finishCompleteAttempt = async (completedAttempt, nowMs) => {
    if (submitting || confirmedResult) return;
    setSubmitting(true);
    setSelectedId(null);
    setMessage("正在保存完成紀錄…");
    try {
      saveAttempt(completedAttempt, nowMs);
      await sync.flush();
      const result = periodicTableAdapter.renderResult(
        await sync.submit(periodicTableAdapter.buildSubmission(completedAttempt, nowMs)),
      );
      setConfirmedResult(result);
      setMessage("完成紀錄已保存。");
    } catch (error) {
      console.error("Periodic submission failed", error);
      setMessage("完成紀錄尚未送出，資料已保留；請檢查網路後重試。");
    } finally {
      setSubmitting(false);
    }
  };

  const tryPlace = (targetId, draggedId = null) => {
    const current = attemptRef.current;
    const elementId = draggedId || selectedId;
    if (!current || current.timerState !== "running" || submitting || confirmedResult || !elementId) return;
    const nowMs = Date.now();
    const domainCurrent = toDomainState(current);
    const domainNext = placeElement(domainCurrent, elementId, targetId);
    if (domainNext === domainCurrent) return;
    let next = fromDomainState(current, domainNext);
    const correct = domainNext.lastAttempt?.correct === true;
    if (correct && Object.keys(next.placements).length === TOTAL) {
      next = fromDomainState(next, pauseTimer(toDomainState(next), nowMs));
    }
    try {
      saveAttempt(next, nowMs);
      updateAttempt(next);
      setClockNow(nowMs);
      if (correct) setSelectedId(null);
      setMessage(correct ? "位置正確。" : "位置不正確，元素仍保留在待放區。");
      if (Object.keys(next.placements).length === TOTAL) void finishCompleteAttempt(next, nowMs);
    } catch (error) {
      console.error("Periodic placement could not be saved", error);
      setMessage("這次操作尚未同步，請稍後重試。");
    }
  };

  const endAttempt = async () => {
    const current = attemptRef.current;
    if (!current || submitting || confirmedResult) return;
    const nowMs = Date.now();
    const next = current.timerState === "running"
      ? fromDomainState(current, pauseTimer(toDomainState(current), nowMs))
      : current;
    try {
      saveAttempt(next, nowMs);
      await sync.flush();
      updateAttempt(next);
      setClockNow(nowMs);
      setSelectedId(null);
      if (Object.keys(next.placements).length === TOTAL) {
        await finishCompleteAttempt(next, nowMs);
      } else {
        setMessage(`本次已結束並保存進度；目前完成 ${Object.keys(next.placements).length}／${TOTAL}。`);
      }
    } catch (error) {
      console.error("Periodic progress could not be ended", error);
      setMessage("進度尚未同步，資料仍保留在此裝置；請檢查網路後重試。");
    }
  };

  const resetAttempt = async () => {
    if (submitting || !window.confirm("確定要清除這份元素表尚未完成的進度嗎？其他試卷不受影響。")) return;
    setSubmitting(true);
    try {
      sync.queueSave({ activeAttempt: null, reviewProgress: {} });
      await sync.flush();
      updateAttempt(null);
      setConfirmedResult(null);
      setSelectedId(null);
      setMessage("元素表進度已清除，可按「開始」建立新測驗。");
    } catch (error) {
      console.error("Periodic reset failed", error);
      setMessage("清除進度尚未同步，請檢查網路後重試。");
    } finally {
      setSubmitting(false);
    }
  };

  const placedCount = attempt ? Object.keys(attempt.placements).length : 0;
  const remainingPool = attempt
    ? attempt.poolOrder.filter((id) => !Object.hasOwn(attempt.placements, id))
    : [];
  const boardDisabled = !attempt || attempt.timerState !== "running" || submitting || Boolean(confirmedResult);
  const displayedElapsed = confirmedResult
    ? confirmedResult.durationSeconds * 1000
    : elapsedAt(attempt, clockNow);

  return (
    <div className="text-slate-900">
      <header className="rounded-2xl bg-gradient-to-br from-emerald-900 to-teal-700 p-5 text-white shadow-lg">
        <h2 className="text-2xl font-bold">化學元素週期表互動測驗</h2>
        <p className="mt-2 text-sm text-emerald-50">拖放元素，或先點選元素再點位置；鍵盤可用 Tab、Enter／Space 操作。</p>
      </header>

      <div className="my-5 grid gap-3 rounded-xl bg-white p-4 shadow sm:grid-cols-3">
        <strong>已完成：{confirmedResult ? confirmedResult.completedCount : placedCount}／{TOTAL}</strong>
        <strong>錯誤嘗試：{confirmedResult ? confirmedResult.errorCount : attempt?.errorCount ?? 0}</strong>
        <strong>計時：{formatDuration(displayedElapsed)}</strong>
      </div>

      {confirmedResult && (
        <section className="mb-5 rounded-xl border-2 border-emerald-600 bg-emerald-50 p-5 text-center">
          <h3 className="text-2xl font-bold text-emerald-900">完成 118／118</h3>
          <p className="mt-2">錯誤嘗試 {confirmedResult.errorCount} 次｜耗時 {formatDuration(confirmedResult.durationSeconds * 1000)}</p>
        </section>
      )}

      {message && <p className="mb-5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">{message}</p>}

      <div className="mb-5 flex flex-wrap gap-2">
        <button type="button" onClick={startNew} disabled={submitting || Boolean(attempt) || Boolean(confirmedResult)} className="rounded-lg bg-emerald-800 px-4 py-2 font-bold text-white disabled:opacity-40">開始</button>
        <button type="button" onClick={togglePause} disabled={!attempt || submitting || Boolean(confirmedResult)} className="rounded-lg bg-sky-800 px-4 py-2 font-bold text-white disabled:opacity-40">{attempt?.timerState === "paused" ? "繼續" : "暫停"}</button>
        <button type="button" onClick={() => void endAttempt()} disabled={!attempt || submitting || Boolean(confirmedResult)} className="rounded-lg bg-slate-700 px-4 py-2 font-bold text-white disabled:opacity-40">結束</button>
        <button type="button" onClick={() => void resetAttempt()} disabled={!attempt || submitting} className="rounded-lg bg-red-800 px-4 py-2 font-bold text-white disabled:opacity-40">重新開始</button>
        <button type="button" onClick={() => setMessage(`目前已正確放置 ${placedCount}／${TOTAL} 個元素。`)} disabled={!attempt} className="rounded-lg border border-slate-400 bg-white px-4 py-2 font-bold disabled:opacity-40">檢查目前答案</button>
      </div>

      <section aria-label="元素週期表放置區" className={`rounded-xl border border-slate-300 bg-slate-100 p-3 ${boardDisabled ? "opacity-75" : ""}`}>
        <div className="overflow-x-auto pb-3">
          <TableGrid elements={mainElements} placements={attempt?.placements ?? {}} disabled={boardDisabled} selectedId={selectedId} onPlace={tryPlace} />
          <div className="mt-5 border-t border-slate-300 pt-3">
            <p className="mb-1 text-xs font-bold text-slate-600">鑭系元素</p>
            <TableGrid elements={lanthanides} placements={attempt?.placements ?? {}} disabled={boardDisabled} selectedId={selectedId} onPlace={tryPlace} columns={15} />
          </div>
          <div className="mt-3">
            <p className="mb-1 text-xs font-bold text-slate-600">錒系元素</p>
            <TableGrid elements={actinides} placements={attempt?.placements ?? {}} disabled={boardDisabled} selectedId={selectedId} onPlace={tryPlace} columns={15} />
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-slate-300 bg-white p-4">
        <h3 className="font-bold">待放元素（{remainingPool.length}）</h3>
        {!attempt && <p className="mt-3 text-sm text-slate-600">按「開始」後會隨機排列 118 個元素。</p>}
        <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(5rem,1fr))] gap-2">
          {remainingPool.map((id) => {
            const element = elementsById.get(id);
            const selected = selectedId === id;
            return (
              <button
                key={id}
                type="button"
                draggable={!boardDisabled}
                disabled={boardDisabled}
                aria-pressed={selected}
                aria-label={`選取 ${element.symbol} ${element.chineseName}`}
                onDragStart={(event) => event.dataTransfer.setData("text/plain", id)}
                onClick={() => setSelectedId(selected ? null : id)}
                className={`flex min-h-16 flex-col items-center justify-center rounded-lg border-2 p-2 ${categoryStyles[element.categoryClass]} ${selected ? "ring-4 ring-emerald-600" : ""} disabled:cursor-not-allowed`}
              >
                <ElementFace element={element} />
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
