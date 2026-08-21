import { useEffect, useRef, useState } from "react";
import { PhysicsChemistryFigure } from "./PhysicsChemistryFigure.jsx";

function formatElapsed(seconds) {
  const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
  const remainder = String(seconds % 60).padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function QuestionCard({ question, position, answer, resolveFigure, disabled, onAnswer }) {
  return (
    <article
      id={`pc-question-${question.id}`}
      className="mb-4 rounded-xl border-2 border-transparent bg-white p-5 shadow-sm"
    >
      <h3 className="whitespace-pre-wrap font-bold leading-7">
        <span className="mr-2 text-slate-500">{position}.</span>
        {question.text}
      </h3>
      <PhysicsChemistryFigure figureIds={question.figureIds} resolve={resolveFigure} />
      <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-2.5">
        {question.options.map((option, index) => {
          const selected = answer === option.id;
          return (
            <button
              key={option.id}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              onClick={() => onAnswer(question.id, option.id)}
              className={`rounded-lg border-2 px-4 py-2.5 text-left text-sm transition ${
                selected
                  ? "border-[#2b5876] bg-sky-100 font-bold"
                  : "border-slate-200 bg-slate-50 hover:bg-slate-100"
              } disabled:cursor-not-allowed`}
            >
              <span className="mr-1 font-mono text-slate-500">{"ABCD"[index]}.</span>
              {option.text}
            </button>
          );
        })}
      </div>
    </article>
  );
}

function ReviewCard({ row, resolveFigure }) {
  return (
    <article
      className={`mb-4 rounded-xl border-2 p-5 shadow-sm ${
        row.isCorrect ? "border-green-700 bg-green-50" : "border-red-700 bg-red-50"
      }`}
    >
      <h3 className="whitespace-pre-wrap font-bold leading-7">
        <span className="mr-2 text-slate-500">{row.attemptPosition}.</span>
        {row.text}
        <span className={`ml-2 text-sm ${row.isCorrect ? "text-green-800" : "text-red-800"}`}>
          {row.isCorrect ? "✓ 答對" : "✗ 答錯"}
        </span>
      </h3>
      <PhysicsChemistryFigure figureIds={row.figureIds} resolve={resolveFigure} />
      <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-2.5">
        {row.options.map((option) => (
          <div
            key={option.id}
            className={`rounded-lg border-2 px-4 py-2.5 text-left text-sm ${
              option.isCorrect
                ? "border-green-700 bg-green-200 font-bold"
                : option.isSelected
                  ? "border-red-700 bg-red-200"
                  : "border-slate-200 bg-slate-50"
            }`}
          >
            <span className="mr-1 font-mono text-slate-500">{option.letter}.</span>
            {option.text}
            {option.isCorrect && <span className="ml-1 text-green-800">（正解）</span>}
            {option.isSelected && !option.isCorrect && <span className="ml-1 text-red-800">（你的選擇）</span>}
          </div>
        ))}
      </div>
      <p className="mt-3 rounded-md bg-white/70 p-3 text-sm leading-6">
        <span className="font-bold">解析：</span>{row.explanation}
      </p>
    </article>
  );
}

export function PhysicsChemistryQuiz({ adapter, resolveFigure, title, range, progress, sync }) {
  const restored = useRef(Boolean(progress?.activeAttempt));
  const initial = useRef(
    progress?.activeAttempt ? adapter.restoreAttempt(progress.activeAttempt) : adapter.createAttempt(),
  );
  const [attempt, setAttempt] = useState(initial.current);
  const [confirmed, setConfirmed] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    if (!restored.current) {
      try {
        sync.queueSave(adapter.serializeProgress(initial.current));
      } catch (error) {
        setMessage(
          error?.message === "progress-refresh-required"
            ? "完成紀錄已保存；請重新整理頁面後再開始新的測驗。"
            : "新測驗尚未同步，請稍後重試。",
        );
      }
    }
  }, [sync, adapter]);

  useEffect(() => {
    if (confirmed || submitting) return undefined;
    const timer = window.setInterval(() => setElapsedSeconds((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(timer);
  }, [confirmed, submitting]);

  useEffect(() => {
    if (typeof sync.onRecoveredSubmission !== "function") return undefined;
    return sync.onRecoveredSubmission(({ result, submission, refreshRequired }) => {
      if (submission?.attemptId !== attempt.attemptId) return;
      try {
        const recovered = adapter.restoreConfirmedSubmission({ currentAttempt: attempt, submission, result });
        setAttempt(recovered.attempt);
        setConfirmed(recovered.result);
        setMessage(refreshRequired
          ? "完成紀錄已保存；請重新整理頁面後再開始新的測驗。"
          : "完成紀錄已保存。");
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch (error) {
        console.error("Recovered physics-chemistry submission could not be displayed", error);
        setMessage("完成紀錄已保存，但結果畫面無法還原；請重新整理頁面。");
      }
    });
  }, [attempt, sync, adapter]);

  const selectAnswer = (questionId, optionId) => {
    if (submitting || confirmed) return;
    const nextAttempt = { ...attempt, answers: { ...attempt.answers, [questionId]: optionId } };
    try {
      sync.queueSave(adapter.serializeProgress(nextAttempt));
      setAttempt(nextAttempt);
      setMessage(null);
    } catch (error) {
      setMessage(
        error?.message === "progress-refresh-required"
          ? "完成紀錄已保存；請重新整理頁面後再繼續。"
          : "這個答案尚未同步，請稍後再試。",
      );
    }
  };

  const submitQuiz = async () => {
    if (submitting || confirmed) return;
    const unanswered = adapter.getUnansweredCount(attempt.answers);
    if (unanswered > 0
      && !window.confirm(`尚有 ${unanswered} 題未作答，未作答將計為錯誤，仍要交卷嗎？`)) {
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      sync.queueSave(adapter.serializeProgress(attempt));
      await sync.flush();
      const result = adapter.renderResult(await sync.submit(adapter.buildSubmission(attempt)));
      setConfirmed(result);
      setMessage("完成紀錄已保存。");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error("Physics-chemistry submission failed", error);
      setMessage(
        error?.message === "progress-refresh-required"
          ? "完成紀錄已保存；請重新整理頁面查看最新進度。"
          : "作答紀錄尚未送出，資料已保留；請檢查網路後重試。",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const reviewRows = confirmed ? adapter.buildAnswerReviewDisplay({ attempt, result: confirmed }) : null;

  return (
    <div className="mx-auto max-w-4xl text-[#333]">
      <header className="rounded-xl bg-gradient-to-br from-[#2b5876] to-[#4e4376] p-5 text-center text-white shadow-md">
        <h2 className="text-2xl font-bold">{title}</h2>
        <p className="mt-2 text-sm opacity-90">{range}</p>
      </header>

      <div className="sticky top-2 z-20 my-5 flex items-center justify-between rounded-full bg-white px-5 py-3 font-bold shadow-lg">
        <span>⏱️ 用時：{formatElapsed(elapsedSeconds)}</span>
        <span className={confirmed && confirmed.score < 60 ? "text-red-700" : "text-green-800"}>
          總分：{confirmed ? confirmed.score : "--"} / 100 分
        </span>
      </div>

      {message && (
        <p className="mb-5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">{message}</p>
      )}

      {confirmed
        ? reviewRows.map((row) => <ReviewCard key={row.id} row={row} resolveFigure={resolveFigure} />)
        : attempt.questions.map((question, index) => (
          <QuestionCard
            key={question.id}
            question={question}
            position={index + 1}
            answer={attempt.answers[question.id]}
            resolveFigure={resolveFigure}
            disabled={submitting}
            onAnswer={selectAnswer}
          />
        ))}

      {!confirmed && (
        <button
          type="button"
          disabled={submitting}
          onClick={() => void submitQuiz()}
          className="my-8 w-full rounded-xl bg-gradient-to-br from-teal-600 to-green-400 px-5 py-4 text-lg font-bold text-white shadow-md disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "正在提交試卷…" : "提交試卷並計分"}
        </button>
      )}
    </div>
  );
}
