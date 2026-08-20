import React, { useEffect, useState, useRef } from "react";
import { createQuizAttemptLifecycle } from "./quizAttemptLifecycle";
import { BIOLOGY_QUIZ_CONTENT } from "./biologyQuizContent.js";
import { biologyQuizAdapter } from "./biologyQuizAdapter.js";
import {
  finishBiologyQuizSubmission,
  recoverBiologyQuizSubmission,
} from "./biologyQuizOrchestration.js";
import { biologyResultStatus } from "./biologyResultPresentation.js";

const LETTERS = ["A", "B", "C", "D"];
const daysUntil = (dateStr) => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - now) / 86400000);
};

function initialBiologyState(progress) {
  if (!progress?.activeAttempt) return null;
  return {
    ...biologyQuizAdapter.restoreAttempt(progress.activeAttempt),
    reviewProgress: structuredClone(progress.reviewProgress ?? {}),
  };
}

export default function BiologyQuiz({ progress, sync }) {
  const restoredRef = useRef(initialBiologyState(progress));
  const [view, setView] = useState(restoredRef.current ? "quiz" : "intro");
  const [attempt, setAttempt] = useState(restoredRef.current);
  const [reviewProgress, setReviewProgress] = useState(
    () => structuredClone(progress?.reviewProgress ?? {}),
  );
  const [clearing, setClearing] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [confirmedResult, setConfirmedResult] = useState(null);
  const attemptLifecycleRef = useRef(createQuizAttemptLifecycle());

  if (attempt && attemptLifecycleRef.current.questionAt(0) === undefined) {
    attemptLifecycleRef.current.restoreAttempt(attempt.questions);
  }

  useEffect(() => {
    if (typeof sync.onRecoveredSubmission !== "function" || !attempt) return undefined;
    return sync.onRecoveredSubmission((recoveredSubmission) => {
      recoverBiologyQuizSubmission({
        lifecycle: attemptLifecycleRef.current,
        attempt,
        sync,
        recoveredSubmission,
        setAttempt,
        setReviewProgress,
        setConfirmedResult,
        setSaveError,
        setView,
        reportError: console.error,
      });
    });
  }, [attempt, sync]);

  const saveAttempt = (nextAttempt, nextReviewProgress = reviewProgress) => {
    sync.queueSave(biologyQuizAdapter.serializeProgress({
      ...nextAttempt,
      reviewProgress: nextReviewProgress,
    }));
  };

  const startQuiz = () => {
    const lifecycle = attemptLifecycleRef.current;
    if (!lifecycle.claimStart()) return;
    try {
      const nextAttempt = biologyQuizAdapter.createAttempt();
      saveAttempt(nextAttempt);
      lifecycle.restoreAttempt(nextAttempt.questions);
      setSaveError(null);
      setConfirmedResult(null);
      setAttempt(nextAttempt);
      setFinishing(false);
      setView("quiz");
    } catch (error) {
      console.error("Biology retry could not start", error);
      setSaveError(
        error?.message === "progress-refresh-required"
          ? "完成紀錄已保存；請重新整理頁面後再開始新的測驗。"
          : "新測驗尚未建立，請稍後重試。",
      );
    } finally {
      lifecycle.releaseStart();
    }
  };

  const selectOption = (qid, optionId) => {
    if (!attemptLifecycleRef.current.canMutateAttempt()) return;
    const nextAttempt = { ...attempt, answers: { ...attempt.answers, [qid]: optionId } };
    setAttempt(nextAttempt);
    saveAttempt(nextAttempt);
  };

  const goNext = () => {
    if (!attemptLifecycleRef.current.canMutateAttempt()) return;
    const next = attemptLifecycleRef.current.move(attempt.currentQuestionIndex, 1);
    if (next !== attempt.currentQuestionIndex) {
      const nextAttempt = { ...attempt, currentQuestionIndex: next };
      setAttempt(nextAttempt);
      saveAttempt(nextAttempt);
    } else {
      void finishQuiz();
    }
  };

  const goPrev = () => {
    if (!attemptLifecycleRef.current.canMutateAttempt()) return;
    const nextAttempt = {
      ...attempt,
      currentQuestionIndex: attemptLifecycleRef.current.move(attempt.currentQuestionIndex, -1),
    };
    setAttempt(nextAttempt);
    saveAttempt(nextAttempt);
  };

  const finishQuiz = () => finishBiologyQuizSubmission({
    lifecycle: attemptLifecycleRef.current,
    attempt,
    reviewProgress,
    saveAttempt,
    sync,
    setAttempt,
    setReviewProgress,
    setConfirmedResult,
    setSaveError,
    setView,
    setFinishing,
    reportError: console.error,
  });

  const resetProgress = async () => {
    const lifecycle = attemptLifecycleRef.current;
    if (!lifecycle.claimClear()) return;

    setClearing(true);
    setSaveError(null);
    try {
      sync.queueSave({ activeAttempt: null, reviewProgress });
      await sync.flush();
      setAttempt(null);
      setConfirmedResult(null);
      setView("intro");
    } catch (error) {
      console.error("Biology reset failed", error);
      setSaveError("清除進度尚未同步，請檢查網路後重試。");
    } finally {
      lifecycle.releaseClear();
      setClearing(false);
    }
  };

  const answerReview = attempt && confirmedResult
    ? biologyQuizAdapter.buildAnswerReviewDisplay({ attempt, result: confirmedResult })
    : [];

  const reviewList = Object.entries(reviewProgress)
    .filter(([, v]) => v.errorCount > 0)
    .map(([id, v]) => {
      const q = BIOLOGY_QUIZ_CONTENT.questions.find((qq) => qq.id === id);
      return { id, text: q ? q.text : "", ...v, daysLeft: daysUntil(v.nextReview) };
    })
    .sort((a, b) => new Date(a.nextReview) - new Date(b.nextReview));

  const fontStyle = { fontFamily: "'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif" };
  const serifStyle = { fontFamily: "'Noto Serif TC', 'PingFang TC', serif" };
  const monoStyle = { fontFamily: "'JetBrains Mono', ui-monospace, monospace" };

  const INK = "#2C4B7C";
  const RED = "#B23A2E";
  const GREEN = "#3F6B4A";
  const PAPER = "#F4EFE1";
  const PAPER_LINE = "#DCD4BC";
  const INKDARK = "#241F1B";

  return (
    <div style={{ ...fontStyle, background: "#1F2E23" }} className="min-h-screen w-full py-8 px-4">
      <style>{`
        .paper-lines {
          background-image: repeating-linear-gradient(
            to bottom,
            transparent,
            transparent 31px,
            ${PAPER_LINE} 32px
          );
        }
        .pen-circle { border: 2.5px solid ${INK}; border-radius: 9999px; }
        .pen-circle-red { border: 2.5px solid ${RED}; border-radius: 9999px; }
      `}</style>

      <div className="max-w-2xl mx-auto">
        <div className="rounded-t-md px-5 py-3 flex items-center justify-between" style={{ background: "#33261C" }}>
          <div>
            <p style={{ ...monoStyle, color: "#C9BFA8" }} className="text-[10px] tracking-[0.2em] uppercase">
              1〜2冊生物・隨堂評量單
            </p>
            <h1 style={{ ...serifStyle, color: PAPER }} className="text-lg font-bold mt-0.5">
              第1回　第1、2單元｜細胞與顯微鏡
            </h1>
          </div>
          <div className="rounded-full flex items-center justify-center w-12 h-12 shrink-0" style={{ border: `2px solid ${GREEN}`, color: PAPER }}>
            <span style={{ ...serifStyle }} className="text-xs font-bold">
              {view === "results" ? `${Math.round(confirmedResult.score)}` : "20題"}
            </span>
          </div>
        </div>

        <div className="paper-lines rounded-b-md px-5 sm:px-7 py-6" style={{ background: PAPER }}>
          {saveError && (
            <BiologySaveError message={saveError} RED={RED} />
          )}

          {view === "intro" && (
            <IntroView
              onStart={startQuiz}
              clearing={clearing}
              progress={reviewProgress}
              reviewCount={reviewList.filter((r) => r.daysLeft <= 0).length}
              serifStyle={serifStyle}
              monoStyle={monoStyle}
              INK={INK}
              RED={RED}
              GREEN={GREEN}
              INKDARK={INKDARK}
            />
          )}

          {view === "quiz" && (
            <QuizView
              question={attempt.questions[attempt.currentQuestionIndex]}
              index={attempt.currentQuestionIndex}
              total={attempt.questions.length}
              selected={attempt.answers[attempt.questions[attempt.currentQuestionIndex].id]}
              onSelect={(optionId) => selectOption(attempt.questions[attempt.currentQuestionIndex].id, optionId)}
              onNext={goNext}
              onPrev={goPrev}
              finishing={finishing}
              serifStyle={serifStyle}
              monoStyle={monoStyle}
              INK={INK}
              INKDARK={INKDARK}
              GREEN={GREEN}
            />
          )}

          {view === "results" && (
            <ResultsView
              score={confirmedResult.correctCount}
              total={attempt.questions.length}
              answerReview={answerReview}
              reviewAvailable={confirmedResult.reviewAvailable}
              reviewList={reviewList}
              actionsDisabled={finishing || clearing}
              onRetry={startQuiz}
              onReset={resetProgress}
              serifStyle={serifStyle}
              monoStyle={monoStyle}
              INK={INK}
              RED={RED}
              GREEN={GREEN}
              INKDARK={INKDARK}
            />
          )}
        </div>

        <p style={{ ...monoStyle, color: "#6b7d70" }} className="text-[10px] text-center mt-3 tracking-wide">
          {view === "results" ? "紀錄已保存" : "作答進度由共用同步服務保留"}
        </p>
      </div>
    </div>
  );
}

export function BiologySaveError({ message, RED }) {
  return (
    <div
      role="alert"
      aria-live="polite"
      className="mb-5 rounded px-4 py-3 text-sm"
      style={{ background: "rgba(178,58,46,0.08)", border: "1px solid #E3B0A8", color: RED }}
    >
      {message}
    </div>
  );
}

/* ---------------------------------------------------------
   Intro
--------------------------------------------------------- */
function IntroView({
  onStart,
  clearing,
  progress,
  reviewCount,
  serifStyle,
  monoStyle,
  INK,
  RED,
  GREEN,
  INKDARK,
}) {
  const attempted = Object.keys(progress).length;
  const totalErrors = Object.values(progress).reduce((s, v) => s + (v.errorCount || 0), 0);

  return (
    <div>
      <p style={{ color: INKDARK }} className="text-sm leading-relaxed mb-6">
        共 20 題，每題 5 分，作答結束後會標示錯題並記錄錯誤次數，並依艾賓浩斯遺忘曲線安排下次複習時間。
      </p>

      {attempted > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <StatBox label="已作答題數" value={attempted} INK={INK} INKDARK={INKDARK} monoStyle={monoStyle} />
          <StatBox label="累計錯誤次數" value={totalErrors} INK={RED} INKDARK={INKDARK} monoStyle={monoStyle} />
          <StatBox label="今日待複習" value={reviewCount} INK={GREEN} INKDARK={INKDARK} monoStyle={monoStyle} />
        </div>
      )}

      <button
        onClick={onStart}
        disabled={clearing}
        style={{ background: INK, ...serifStyle }}
        className="w-full py-3.5 rounded text-white font-bold text-base hover:opacity-90 transition disabled:opacity-50"
      >
        {clearing
          ? "清除中…"
          : attempted > 0
              ? "重新測驗"
              : "開始測驗"}
      </button>
    </div>
  );
}

function StatBox({ label, value, INK, INKDARK, monoStyle }) {
  return (
    <div className="rounded border border-black/10 py-3 text-center bg-white/40">
      <p style={{ ...monoStyle, color: INK }} className="text-2xl font-bold">
        {value}
      </p>
      <p style={{ color: INKDARK }} className="text-[11px] mt-1">
        {label}
      </p>
    </div>
  );
}

/* ---------------------------------------------------------
   Quiz
--------------------------------------------------------- */
function QuizView({ question, index, total, selected, onSelect, onNext, onPrev, finishing, serifStyle, monoStyle, INK, INKDARK, GREEN }) {
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-5">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className="w-5 h-5 rounded-full flex items-center justify-center text-[9px]"
            style={{
              ...monoStyle,
              border: `1.5px solid ${i === index ? INK : "#C9BFA8"}`,
              background: i === index ? INK : i < index ? "#E4DCC5" : "transparent",
              color: i === index ? "#fff" : INKDARK,
            }}
          >
            {i + 1}
          </div>
        ))}
      </div>

      <p style={{ ...monoStyle, color: GREEN }} className="text-xs tracking-widest mb-2">
        第 {index + 1} 題 ／ 共 {total} 題
      </p>
      <p style={{ color: INKDARK }} className="text-base leading-relaxed mb-5 font-medium">
        {question.text}
      </p>

      <div className="space-y-2.5 mb-7">
        {question.options.map((opt, idx) => {
          const isSelected = selected === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => onSelect(opt.id)}
              disabled={finishing}
              className="w-full text-left flex items-start gap-3 px-4 py-3 rounded transition disabled:opacity-60"
              style={{
                background: isSelected ? "rgba(44,75,124,0.08)" : "white",
                border: `1.5px solid ${isSelected ? INK : "#DCD4BC"}`,
              }}
            >
              <span
                className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mt-0.5 ${isSelected ? "pen-circle" : ""}`}
                style={{ ...monoStyle, color: isSelected ? INK : "#8a8272", borderColor: isSelected ? INK : "transparent" }}
              >
                {LETTERS[idx]}
              </span>
              <span style={{ color: INKDARK }} className="text-sm leading-relaxed pt-0.5">
                {opt.text}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex gap-3">
        <button onClick={onPrev} disabled={index === 0 || finishing} style={{ ...serifStyle, color: INKDARK, borderColor: "#C9BFA8" }} className="px-4 py-2.5 rounded border text-sm font-bold disabled:opacity-30">
          上一題
        </button>
        <button onClick={onNext} disabled={selected === undefined || finishing} style={{ ...serifStyle, background: INK }} className="flex-1 py-2.5 rounded text-white text-sm font-bold disabled:opacity-30">
          {finishing ? "儲存中…" : index === total - 1 ? "完成測驗" : "下一題"}
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   Results
--------------------------------------------------------- */
function ResultsView({ score, total, answerReview, reviewAvailable, reviewList, actionsDisabled, onRetry, onReset, serifStyle, monoStyle, INK, RED, GREEN, INKDARK }) {
  return (
    <div>
      <div className="text-center mb-6">
        <p style={{ color: INKDARK }} className="text-sm font-bold mb-2">
          已驗證學生
        </p>
        <p style={{ ...monoStyle, color: "#8a8272" }} className="text-[10px] tracking-[0.25em] uppercase mb-1">
          得分
        </p>
        <p style={{ ...serifStyle, color: score * 5 >= 60 ? GREEN : RED }} className="text-5xl font-bold">
          {score * 5}
          <span className="text-lg" style={{ color: INKDARK }}>
            {" "}
            / 100
          </span>
        </p>
        <p style={{ color: INKDARK }} className="text-sm mt-1">
          答對 {score} 題，答錯 {total - score} 題
        </p>
      </div>

      <BiologyResultReview
        answerReview={answerReview}
        reviewAvailable={reviewAvailable}
        serifStyle={serifStyle}
        monoStyle={monoStyle}
        INK={INK}
        RED={RED}
        GREEN={GREEN}
        INKDARK={INKDARK}
      />

      {reviewList.length > 0 && (
        <div className="mb-7">
          <h3 style={{ ...serifStyle, color: INKDARK }} className="text-sm font-bold mb-3">
            艾賓浩斯複習排程
          </h3>
          <EbbinghausCurve INK={INK} monoStyle={monoStyle} />
          <div className="space-y-2 mt-3">
            {reviewList.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-3 py-2 rounded" style={{ background: "white", border: "1px solid #DCD4BC" }}>
                <div className="min-w-0 pr-3">
                  <p style={{ color: INKDARK }} className="text-xs truncate">
                    {r.text}
                  </p>
                  <p style={{ ...monoStyle, color: "#8a8272" }} className="text-[10px]">
                    錯 {r.errorCount} 次 ・ 第 {r.stage + 1} 階段（間隔 {INTERVALS[r.stage]} 天）
                  </p>
                </div>
                <div
                  className="shrink-0 text-right px-2.5 py-1 rounded"
                  style={{ ...monoStyle, fontSize: "11px", color: r.daysLeft <= 0 ? "#fff" : INK, background: r.daysLeft <= 0 ? RED : "rgba(44,75,124,0.08)" }}
                >
                  {r.daysLeft <= 0 ? "今日複習" : `${r.nextReview}（${r.daysLeft}天後）`}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={onReset} disabled={actionsDisabled} style={{ ...serifStyle, color: INKDARK, borderColor: "#C9BFA8" }} className="px-4 py-2.5 rounded border text-sm font-bold disabled:opacity-50">
          清除本次進度
        </button>
        <button onClick={onRetry} disabled={actionsDisabled} style={{ ...serifStyle, background: INK }} className="flex-1 py-2.5 rounded text-white text-sm font-bold disabled:opacity-50">
          重新測驗
        </button>
      </div>
    </div>
  );
}

export function BiologyResultReview({ answerReview, reviewAvailable, serifStyle, monoStyle, INK, RED, GREEN, INKDARK }) {
  const resultStatus = biologyResultStatus({ reviewAvailable });

  if (!reviewAvailable) {
    return (
      <section
        aria-label="成績說明"
        className="rounded border px-4 py-3 text-sm leading-relaxed mb-7"
        style={{ color: INKDARK, borderColor: "#DCD4BC", background: "rgba(255,255,255,0.45)" }}
      >
        {resultStatus}
      </section>
    );
  }

  return (
    <section aria-labelledby="biology-answer-review-heading" className="mb-7">
      <h2 id="biology-answer-review-heading" style={{ ...serifStyle, color: INK }} className="text-base font-bold mb-3">
        {resultStatus}（{answerReview.length} 題）
      </h2>
      <ol className="space-y-3">
        {answerReview.map((row) => {
          const statusColor = row.isCorrect ? GREEN : RED;
          const borderColor = row.isCorrect ? "#AAC4AF" : "#E3B0A8";
          const background = row.isCorrect
            ? "rgba(63,107,74,0.06)"
            : "rgba(178,58,46,0.05)";
          return (
            <li key={row.id} className="rounded border px-4 py-4" style={{ borderColor, background }}>
              <div className="flex items-center justify-between gap-3 mb-2">
                <p style={{ ...monoStyle, color: statusColor }} className="text-xs font-bold">
                  {row.isCorrect ? "✓ 答對" : "✕ 答錯"}
                </p>
                <p style={{ ...monoStyle, color: "#8a8272" }} className="text-[10px]">
                  本次第 {row.attemptPosition} 題
                </p>
              </div>
              <p style={{ color: INKDARK }} className="text-sm leading-relaxed mb-3 font-medium">
                {row.text}
              </p>
              <p style={{ color: INKDARK }} className="text-xs">
                你的答案：
                <span style={{ color: statusColor }} className="font-bold">
                  {" "}
                  {row.selectedAnswer
                    ? `(${row.selectedAnswer.letter}) ${row.selectedAnswer.text}`
                    : "未作答"}
                </span>
              </p>
              <p style={{ color: INKDARK }} className="text-xs mt-0.5">
                正確答案：
                <span style={{ color: GREEN }} className="font-bold">
                  {" "}
                  ({row.correctAnswer.letter}) {row.correctAnswer.text}
                </span>
              </p>
              <div
                className="rounded mt-3 px-3 py-2.5 text-xs leading-relaxed"
                style={{ color: INKDARK, background: "rgba(255,255,255,0.58)", borderLeft: `3px solid ${statusColor}` }}
              >
                💡 <strong>解題觀念：</strong>{row.explanation}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function EbbinghausCurve({ INK, monoStyle }) {
  const w = 300;
  const h = 70;
  const pts = [
    [0, 8],
    [40, 42],
    [90, 52],
    [150, 58],
    [220, 62],
    [300, 65],
  ];
  const path = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(" ");
  return (
    <div className="rounded px-3 py-3" style={{ background: "white", border: "1px solid #DCD4BC" }}>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto">
        <path d={path} fill="none" stroke={INK} strokeWidth="2" />
        {[1, 2, 4, 7, 15, 30].map((d, i) => (
          <circle key={d} cx={pts[i][0]} cy={pts[i][1]} r="3" fill={INK} />
        ))}
      </svg>
      <div className="flex justify-between mt-1">
        {[1, 2, 4, 7, 15, 30].map((d) => (
          <span key={d} style={{ ...monoStyle, color: "#8a8272" }} className="text-[9px]">
            {d}天
          </span>
        ))}
      </div>
    </div>
  );
}
