import { useEffect, useMemo, useRef, useState } from "react";
import { PhysicsChemistryFigure } from "./PhysicsChemistryFigure.jsx";
import { createGameAudio, MONSTERS, rankOf } from "./physicsGameAudio.js";
import "./physicsGame.css";

const sleep = (ms) => new Promise((resolve) => { window.setTimeout(resolve, ms); });

function formatElapsed(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function spawnFloat(card, text, comboLevel, miss) {
  if (!card) return;
  const f = document.createElement("div");
  f.className = "pcg-float" + (miss ? " pcg-float-miss" : "");
  f.textContent = text;
  if (!miss && comboLevel >= 2) {
    const c = document.createElement("span");
    c.className = "pcg-float-combo";
    c.textContent = `COMBO x${comboLevel} 🔥`;
    f.appendChild(c);
  }
  card.appendChild(f);
  window.setTimeout(() => f.remove(), 1350);
}

function spawnParticles(card) {
  if (!card) return;
  const burst = document.createElement("div");
  burst.className = "pcg-burst";
  const emojis = ["✨", "⭐", "💥", "🌟", "💫", "⚡"];
  for (let i = 0; i < 9; i += 1) {
    const p = document.createElement("span");
    p.className = "pcg-particle";
    p.textContent = emojis[i % emojis.length];
    const ang = (Math.PI * 2) * (i / 9);
    const dist = 54;
    p.style.setProperty("--dx", `${Math.cos(ang) * dist}px`);
    p.style.setProperty("--dy", `${Math.sin(ang) * dist}px`);
    burst.appendChild(p);
  }
  card.appendChild(burst);
  window.setTimeout(() => burst.remove(), 900);
}

function launchConfetti() {
  const colors = ["#f6e05e", "#68d391", "#63b3ed", "#f6ad55", "#fc8181", "#b794f4"];
  for (let i = 0; i < 80; i += 1) {
    const c = document.createElement("div");
    c.className = "pcg-confetti";
    c.style.left = `${(i * 1.25) % 100}vw`;
    c.style.background = colors[i % colors.length];
    const dur = 2.6 + (i % 5) * 0.4;
    c.style.animationDuration = `${dur}s`;
    c.style.animationDelay = `${(i % 6) * 0.1}s`;
    document.body.appendChild(c);
    window.setTimeout(() => c.remove(), (dur + 1) * 1000);
  }
}

function GameCard({ cardRef, monster, position, question, row, revealed, answer, resolveFigure, disabled, onAnswer }) {
  const options = revealed && row ? row.options : question.options.map((o, i) => ({ ...o, letter: "ABCD"[i] }));
  const figureIds = question.figureIds;
  const monsterClass = !revealed ? "pcg-monster" : row.isCorrect ? "pcg-monster pcg-monster-dead" : "pcg-monster pcg-monster-hurt";
  const monsterGlyph = revealed ? (row.isCorrect ? "💀" : "😈") : monster;
  return (
    <article ref={cardRef} className={`pcg-card${revealed ? (row.isCorrect ? " pcg-og-cleared" : " pcg-og-failed") : ""}`}>
      <div className="pcg-qtitle">
        <span style={{ color: "#718096", marginRight: 6 }}>{position}.</span>
        {question.text}
        <span className="pcg-monster-wrap"><span className={monsterClass}>{monsterGlyph}</span></span>
      </div>
      <PhysicsChemistryFigure figureIds={figureIds} resolve={resolveFigure} />
      <div className="pcg-options">
        {options.map((option) => {
          const selected = answer === option.id;
          let cls = "pcg-option";
          if (revealed) {
            if (option.isCorrect) cls += " pcg-opt-correct";
            else if (option.isSelected) cls += " pcg-opt-wrong";
          } else if (selected) {
            cls += " pcg-option-selected";
          }
          return (
            <button
              key={option.id}
              type="button"
              className={cls}
              disabled={disabled || revealed}
              aria-pressed={selected}
              onClick={() => onAnswer(question.id, option.id)}
            >
              {option.text}
            </button>
          );
        })}
      </div>
      {revealed && row && (
        <div className={`pcg-feedback ${row.isCorrect ? "pcg-feedback-correct" : "pcg-feedback-wrong"}`}>
          <strong>
            {row.isCorrect
              ? `⚔️ 擊敗怪物！答案是 (${row.correctAnswer.letter})`
              : `💥 怪物反擊！正確答案是 (${row.correctAnswer.letter})`}
          </strong>
          <div className="pcg-exp">💡 <strong>解題觀念：</strong>{row.explanation}</div>
        </div>
      )}
    </article>
  );
}

export function PhysicsChemistryQuiz({ adapter, resolveFigure, title, subtitle, intro, pointsPerQuestion, progress, sync }) {
  const restored = useRef(Boolean(progress?.activeAttempt));
  const initial = useRef(progress?.activeAttempt ? adapter.restoreAttempt(progress.activeAttempt) : adapter.createAttempt());
  const [attempt, setAttempt] = useState(initial.current);
  const size = attempt.questions.length;

  const [answers, setAnswers] = useState(initial.current.answers ?? {});
  const [phase, setPhase] = useState("answering"); // answering | settling | done
  const [confirmed, setConfirmed] = useState(null);
  const [reviewRows, setReviewRows] = useState(null);
  const [settleIndex, setSettleIndex] = useState(0);
  const [hud, setHud] = useState({ score: 0, correct: 0, combo: 0, maxCombo: 0 });
  const [muted, setMuted] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [message, setMessage] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const audioRef = useRef(null);
  if (audioRef.current === null) audioRef.current = createGameAudio();
  const rootRef = useRef(null);
  const flashRef = useRef(null);
  const scoreRef = useRef(null);
  const cardRefs = useRef([]);
  const cancelRef = useRef(false);
  const initializedRef = useRef(false);

  const monsters = useMemo(
    () => attempt.questions.map((_, i) => MONSTERS[(i * 5 + 3) % MONSTERS.length]),
    [attempt],
  );

  useEffect(() => () => { cancelRef.current = true; }, []);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    if (!restored.current) {
      try {
        sync.queueSave(adapter.serializeProgress(initial.current));
      } catch (error) {
        setMessage(error?.message === "progress-refresh-required"
          ? "完成紀錄已保存；請重新整理頁面後再開始新的測驗。"
          : "新測驗尚未同步，請稍後重試。");
      }
    }
  }, [sync, adapter]);

  useEffect(() => {
    if (phase !== "answering") return undefined;
    const timer = window.setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  function flash(color) {
    const el = flashRef.current;
    if (!el) return;
    el.className = "pcg-flash";
    void el.offsetWidth;
    el.className = `pcg-flash pcg-flash-${color}`;
  }
  function shake() {
    const el = rootRef.current;
    if (!el) return;
    el.classList.remove("pcg-shake");
    void el.offsetWidth;
    el.classList.add("pcg-shake");
    window.setTimeout(() => el.classList.remove("pcg-shake"), 340);
  }
  function pulseScore(value) {
    const el = scoreRef.current;
    if (!el) return;
    el.textContent = String(Math.round(value * 10) / 10);
    el.classList.remove("pcg-score-pulse");
    void el.offsetWidth;
    el.classList.add("pcg-score-pulse");
  }

  function finishBattle(finalScore, maxCombo, correct) {
    setHud({ score: finalScore, correct, combo: 0, maxCombo });
    pulseScore(finalScore);
    setPhase("done");
    setSettleIndex(size);
    launchConfetti();
    audioRef.current.fanfare();
  }

  async function runSettlement(rows) {
    let score = 0;
    let combo = 0;
    let maxCombo = 0;
    let correct = 0;
    for (let i = 0; i < rows.length; i += 1) {
      if (cancelRef.current) return;
      const row = rows[i];
      if (row.isCorrect) {
        combo += 1;
        maxCombo = Math.max(maxCombo, combo);
        score += pointsPerQuestion;
        correct += 1;
      } else {
        combo = 0;
      }
      setHud({ score, correct, combo, maxCombo });
      setSettleIndex(i + 1);
      // let React paint the revealed card, then fire transient effects
      await sleep(30);
      const card = cardRefs.current[i];
      if (card) card.scrollIntoView({ block: "center", behavior: "smooth" });
      if (row.isCorrect) {
        spawnFloat(card, `+${pointsPerQuestion}`, combo, false);
        spawnParticles(card);
        flash("green");
        shake();
        audioRef.current.hit(combo);
      } else {
        spawnFloat(card, "MISS", 0, true);
        flash("red");
        audioRef.current.miss();
      }
      pulseScore(score);
      await sleep(row.isCorrect ? 430 : 540);
    }
    if (!cancelRef.current) finishBattle(score, maxCombo, correct);
  }

  function skipSettlement() {
    if (!reviewRows) return;
    cancelRef.current = true; // stop the settlement loop for good; do not reset
    const correct = reviewRows.filter((r) => r.isCorrect).length;
    let combo = 0;
    let maxCombo = 0;
    for (const r of reviewRows) { combo = r.isCorrect ? combo + 1 : 0; maxCombo = Math.max(maxCombo, combo); }
    finishBattle(confirmed ? confirmed.score : correct * pointsPerQuestion, maxCombo, correct);
  }

  useEffect(() => {
    if (typeof sync.onRecoveredSubmission !== "function") return undefined;
    return sync.onRecoveredSubmission(({ result, submission, refreshRequired }) => {
      if (submission?.attemptId !== attempt.attemptId) return;
      try {
        const recovered = adapter.restoreConfirmedSubmission({ currentAttempt: attempt, submission, result });
        const rows = adapter.buildAnswerReviewDisplay({ attempt: recovered.attempt, result: recovered.result });
        setAttempt(recovered.attempt);
        setConfirmed(recovered.result);
        setReviewRows(rows);
        const correct = rows.filter((r) => r.isCorrect).length;
        let combo = 0; let maxCombo = 0;
        for (const r of rows) { combo = r.isCorrect ? combo + 1 : 0; maxCombo = Math.max(maxCombo, combo); }
        setHud({ score: recovered.result.score, correct, combo: 0, maxCombo });
        setSettleIndex(rows.length);
        setPhase("done");
        setMessage(refreshRequired ? "完成紀錄已保存；請重新整理頁面後再開始新的測驗。" : "完成紀錄已保存。");
      } catch (error) {
        console.error("Recovered physics-chemistry submission could not be displayed", error);
        setMessage("完成紀錄已保存，但結果畫面無法還原；請重新整理頁面。");
      }
    });
  }, [attempt, sync, adapter]);

  const selectAnswer = (questionId, optionId) => {
    if (phase !== "answering" || submitting) return;
    const nextAnswers = { ...answers, [questionId]: optionId };
    const nextAttempt = { ...attempt, answers: nextAnswers };
    try {
      sync.queueSave(adapter.serializeProgress(nextAttempt));
      setAnswers(nextAnswers);
      setAttempt(nextAttempt);
      setMessage(null);
    } catch (error) {
      setMessage(error?.message === "progress-refresh-required"
        ? "完成紀錄已保存；請重新整理頁面後再繼續。"
        : "這個答案尚未同步，請稍後再試。");
    }
  };

  const submitQuiz = async () => {
    if (phase !== "answering" || submitting) return;
    const unanswered = adapter.getUnansweredCount(answers);
    if (unanswered > 0 && !window.confirm(`尚有 ${unanswered} 隻怪物未挑戰（未作答將計為錯誤），確定要開始結算嗎？`)) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const submitAttempt = { ...attempt, answers };
      sync.queueSave(adapter.serializeProgress(submitAttempt));
      await sync.flush();
      const result = adapter.renderResult(await sync.submit(adapter.buildSubmission(submitAttempt)));
      const rows = adapter.buildAnswerReviewDisplay({ attempt: submitAttempt, result });
      setConfirmed(result);
      setReviewRows(rows);
      setPhase("settling");
      setSettleIndex(0);
      setHud({ score: 0, correct: 0, combo: 0, maxCombo: 0 });
      window.scrollTo({ top: 0, behavior: "smooth" });
      cancelRef.current = false;
      void runSettlement(rows);
    } catch (error) {
      console.error("Physics-chemistry submission failed", error);
      setMessage(error?.message === "progress-refresh-required"
        ? "完成紀錄已保存；請重新整理頁面查看最新進度。"
        : "作答紀錄尚未送出，資料已保留；請檢查網路後重試。");
    } finally {
      setSubmitting(false);
    }
  };

  const answeredCount = Object.keys(answers).length;
  const progressPct = phase === "answering"
    ? Math.round((answeredCount / size) * 100)
    : Math.round((settleIndex / size) * 100);
  const rank = phase === "done" ? rankOf(confirmed ? confirmed.score : hud.score) : null;

  return (
    <div className="pcg-root mx-auto max-w-3xl text-[#333]" ref={rootRef}>
      <div className="pcg-flash" ref={flashRef} />

      <div className="pcg-hud">
        <div className="pcg-hud-block">🏆 <span className="pcg-score" ref={scoreRef}>{Math.round(hud.score * 10) / 10}</span><span style={{ fontSize: "0.7em", color: "#cbd5e0" }}>分</span></div>
        <div className="pcg-hud-block">⚔️ 擊敗 <span className="pcg-correct">{hud.correct}</span>/{size}</div>
        {hud.combo >= 2 && <div className="pcg-combo pcg-combo-pop">🔥 COMBO x{hud.combo}</div>}
        <div className="pcg-prog-wrap">
          <div className="pcg-prog-fill" style={{ width: `${progressPct}%` }} />
          <div className="pcg-prog-label">{progressPct}%</div>
        </div>
        <button
          type="button"
          className="pcg-mute"
          title="音效開關"
          onClick={() => { const next = !muted; setMuted(next); audioRef.current.setMuted(next); }}
        >
          {muted ? "🔇" : "🔊"}
        </button>
      </div>

      <h1 className="mt-4 text-center text-2xl font-bold text-[#1a365d]">{title} 🎮</h1>
      <p className="mt-1 text-center text-sm text-slate-500">{subtitle}</p>

      <div className="pcg-hud-block" style={{ justifyContent: "center", color: "#2b6cb0", marginTop: 8 }}>
        ⏱️ {formatElapsed(elapsedSeconds)}
      </div>

      {phase === "answering" && <div className="pcg-intro">{intro}</div>}

      {message && (
        <p className="my-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">{message}</p>
      )}

      {phase === "done" && rank && (
        <div className="pcg-board">
          <span className="pcg-rank-badge">{rank.badge}</span>
          <div style={{ fontSize: "1.3em", color: rank.color }}>{rank.title}</div>
          <div style={{ marginTop: 10 }}>🗡️ 全數怪物討伐完畢！</div>
          擊敗怪物：{hud.correct} / {size} 隻<br />
          最高連擊：🔥 COMBO x{hud.maxCombo}<br />
          總得分：<span className="pcg-board-score">{confirmed ? confirmed.score : hud.score}</span> 分<br />
          花費時間：{formatElapsed(elapsedSeconds)}
        </div>
      )}

      {attempt.questions.map((question, index) => (
        <GameCard
          key={question.id}
          cardRef={(el) => { cardRefs.current[index] = el; }}
          monster={monsters[index]}
          position={index + 1}
          question={question}
          row={reviewRows ? reviewRows[index] : null}
          revealed={settleIndex > index}
          answer={answers[question.id]}
          resolveFigure={resolveFigure}
          disabled={phase !== "answering" || submitting}
          onAnswer={selectAnswer}
        />
      ))}

      {phase === "answering" && (
        <button type="button" className="pcg-submit" disabled={submitting} onClick={() => void submitQuiz()}>
          {submitting ? "正在結算…" : "⚔️ 開始結算（提交試卷）"}
        </button>
      )}
      {phase === "settling" && (
        <div style={{ textAlign: "center" }}>
          <button type="button" className="pcg-skip" onClick={skipSettlement}>⏭️ 跳過動畫，直接看結果</button>
        </div>
      )}
    </div>
  );
}
