import { useEffect, useMemo, useRef, useState } from "react";
import { ENGLISH_REVIEW_2 } from "../functions/shared/englishReview2Definition.js";
import { EnglishQuestionFigure } from "./EnglishQuestionFigure.jsx";
import { englishReview2Adapter } from "./englishReview2Adapter.js";

function initialAttempt(progress) {
  return progress?.activeAttempt
    ? englishReview2Adapter.restoreAttempt(progress.activeAttempt)
    : englishReview2Adapter.createAttempt();
}

function formatElapsed(seconds) {
  const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
  const remainder = String(seconds % 60).padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function ReadingBlock({ readingId }) {
  return (
    <div className="mb-4 rounded-r-lg border-l-4 border-[#2b5876] bg-slate-100 px-5 py-4 text-sm leading-7">
      <pre className="whitespace-pre-wrap font-sans">{ENGLISH_REVIEW_2.readings[readingId]}</pre>
    </div>
  );
}

function QuestionCard({ question, answer, confirmedResult, disabled, onAnswer }) {
  const isConfirmed = Array.isArray(confirmedResult?.wrongIds);
  const isWrong = isConfirmed && confirmedResult.wrongIds.includes(question.id);
  return (
    <article
      id={`english-question-${question.id}`}
      className={`mb-4 rounded-xl border-2 bg-white p-5 shadow-sm ${
        !isConfirmed
          ? "border-transparent"
          : isWrong
            ? "border-red-700 bg-red-50"
            : "border-green-700 bg-green-50"
      }`}
    >
      <h3 className="whitespace-pre-wrap font-bold leading-7">{question.text}</h3>
      {question.figureId && <EnglishQuestionFigure figureId={question.figureId} />}
      <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-2.5">
        {question.options.map((option) => {
          const selected = answer === option.id;
          const confirmedCorrect = isConfirmed && option.correct;
          const confirmedWrong = isConfirmed && selected && !option.correct;
          return (
            <button
              key={option.id}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              onClick={() => onAnswer(question.id, option.id)}
              className={`rounded-lg border-2 px-4 py-2.5 text-left text-sm transition ${
                confirmedCorrect
                  ? "border-green-700 bg-green-200 font-bold"
                  : confirmedWrong
                    ? "border-red-700 bg-red-200"
                    : selected
                      ? "border-[#2b5876] bg-sky-100 font-bold"
                      : "border-slate-200 bg-slate-50 hover:bg-slate-100"
              } disabled:cursor-not-allowed`}
            >
              {option.text}
            </button>
          );
        })}
      </div>
      {isConfirmed && (
        <p className="mt-3 rounded-md bg-white/70 p-3 text-sm leading-6">{question.explanation}</p>
      )}
    </article>
  );
}

export default function EnglishReview2Quiz({ progress, sync }) {
  const restored = useRef(Boolean(progress?.activeAttempt));
  const initial = useRef(initialAttempt(progress));
  const [attempt, setAttempt] = useState(initial.current);
  const [confirmedResult, setConfirmedResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    if (!restored.current) {
      try {
        sync.queueSave(englishReview2Adapter.serializeProgress(initial.current));
      } catch (error) {
        setMessage(
          error?.message === "progress-refresh-required"
            ? "完成紀錄已保存；請重新整理頁面後再開始新的測驗。"
            : "新測驗尚未同步，請稍後重試。",
        );
      }
      return;
    }
    if (initial.current.lastAnsweredId) {
      requestAnimationFrame(() => {
        document.getElementById(`english-question-${initial.current.lastAnsweredId}`)
          ?.scrollIntoView({ block: "center" });
      });
    }
  }, [sync]);

  useEffect(() => {
    if (confirmedResult || submitting) return undefined;
    const timer = window.setInterval(() => setElapsedSeconds((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(timer);
  }, [confirmedResult, submitting]);

  useEffect(() => {
    if (typeof sync.onRecoveredSubmission !== "function") return undefined;
    return sync.onRecoveredSubmission(({ result, submission, refreshRequired }) => {
      if (submission?.attemptId !== attempt.attemptId) return;
      try {
        const recovered = englishReview2Adapter.restoreConfirmedSubmission({
          currentAttempt: attempt,
          submission,
          result,
        });
        setAttempt(recovered.attempt);
        setConfirmedResult(recovered.result);
        setMessage(
          refreshRequired
            ? "完成紀錄已保存；請重新整理頁面後再開始新的測驗。"
            : recovered.result.reviewAvailable === false
              ? "完成紀錄已保存；此筆舊成績沒有逐題錯題資料，因此只顯示總成績。"
              : "完成紀錄已保存。",
        );
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch (error) {
        console.error("Recovered English submission could not be displayed", error);
        setMessage("完成紀錄已保存，但結果畫面無法還原；請重新整理頁面。");
      }
    });
  }, [attempt, sync]);

  const questionsBySection = useMemo(() => ({
    1: ENGLISH_REVIEW_2.questions.filter(({ section }) => section === 1),
    2: ENGLISH_REVIEW_2.questions.filter(({ section }) => section === 2),
  }), []);

  const selectAnswer = (questionId, optionId) => {
    if (submitting || confirmedResult) return;
    const nextAttempt = {
      ...attempt,
      answers: { ...attempt.answers, [questionId]: optionId },
      lastAnsweredId: questionId,
    };
    try {
      sync.queueSave(englishReview2Adapter.serializeProgress(nextAttempt));
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
    if (submitting || confirmedResult) return;
    const unanswered = englishReview2Adapter.getUnansweredCount(attempt.answers);
    if (unanswered > 0
      && !window.confirm(`尚有 ${unanswered} 題未作答，未作答將計為錯誤，仍要交卷嗎？`)) {
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      sync.queueSave(englishReview2Adapter.serializeProgress(attempt));
      await sync.flush();
      const result = englishReview2Adapter.renderResult(
        await sync.submit(englishReview2Adapter.buildSubmission(attempt)),
      );
      setConfirmedResult(result);
      setMessage(
        result.reviewAvailable === false
          ? "完成紀錄已保存；此筆舊成績沒有逐題錯題資料，因此只顯示總成績。"
          : "完成紀錄已保存。",
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error("English submission failed", error);
      setMessage(
        error?.message === "progress-refresh-required"
          ? "完成紀錄已保存；請重新整理頁面查看最新進度。"
          : "作答紀錄尚未送出，資料已保留；請檢查網路後重試。",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const renderQuestions = (questions) => {
    let previousReadingId = null;
    return questions.map((question) => {
      const showReading = question.readingId && question.readingId !== previousReadingId;
      previousReadingId = question.readingId ?? previousReadingId;
      return (
        <div key={question.id}>
          {showReading && <ReadingBlock readingId={question.readingId} />}
          <QuestionCard
            question={question}
            answer={attempt.answers[question.id]}
            confirmedResult={confirmedResult}
            disabled={submitting || confirmedResult !== null}
            onAnswer={selectAnswer}
          />
        </div>
      );
    });
  };

  return (
    <div className="mx-auto max-w-4xl text-[#333]">
      <header className="rounded-xl bg-gradient-to-br from-[#2b5876] to-[#4e4376] p-5 text-center text-white shadow-md">
        <h2 className="text-2xl font-bold">英語科 第2回複習考</h2>
        <p className="mt-2 text-sm opacity-90">範圍：第一冊 L3～L4（表位置的介系詞／Where問答／祈使句／人稱代名詞受格／can問答）</p>
      </header>

      <div className="sticky top-2 z-20 my-5 flex items-center justify-between rounded-full bg-white px-5 py-3 font-bold shadow-lg">
        <span>⏱️ 用時：{formatElapsed(elapsedSeconds)}</span>
        <span className={confirmedResult && confirmedResult.score < 60 ? "text-red-700" : "text-green-800"}>
          總分：{confirmedResult ? confirmedResult.score : "--"} / 100 分
        </span>
      </div>

      {message && (
        <p className="mb-5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">{message}</p>
      )}

      <h2 className="my-7 border-b-2 border-[#2b5876] pb-1 text-xl font-bold text-[#2b5876]">
        第一部分（1～20題，每題2分）
      </h2>
      {renderQuestions(questionsBySection[1])}

      <h2 className="my-7 border-b-2 border-[#2b5876] pb-1 text-xl font-bold text-[#2b5876]">
        第二部分 下列各題（題號21～40）請依所附資料選出一個正確或是最佳的答案。（每題3分）
      </h2>
      {renderQuestions(questionsBySection[2])}

      <button
        type="button"
        disabled={submitting || confirmedResult !== null}
        onClick={() => void submitQuiz()}
        className="my-8 w-full rounded-xl bg-gradient-to-br from-teal-600 to-green-400 px-5 py-4 text-lg font-bold text-white shadow-md disabled:cursor-not-allowed disabled:opacity-60"
      >
        {confirmedResult ? "試卷已提交" : submitting ? "正在提交試卷…" : "提交試卷並計分"}
      </button>
    </div>
  );
}
