import { useEffect, useMemo, useRef, useState } from "react";
import { PhysicsChemistryFigure } from "./PhysicsChemistryFigure.jsx";
import { createGameAudio, MONSTERS, rankOf } from "./physicsGameAudio.js";
import "./physicsGame.css";

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
    p.style.setProperty("--dx", `${Math.cos(ang) * 54}px`);
    p.style.setProperty("--dy", `${Math.sin(ang) * 54}px`);
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

// Recompute running score/combo/correct from answered verdicts, in question order.
function tallyFromVerdicts(questions, answers, verdicts, pointsPerQuestion) {
  let score = 0; let correct = 0; let combo = 0; let maxCombo = 0;
  for (const q of questions) {
    if (!Object.hasOwn(answers, q.id) || !verdicts[q.id]) continue;
    if (verdicts[q.id].correct) {
      combo += 1; maxCombo = Math.max(maxCombo, combo); correct += 1; score += pointsPerQuestion;
    } else {
      combo = 0;
    }
  }
  return { score, correct, combo, maxCombo };
}

function QuestionCard({ cardRef, monster, position, question, answer, verdict, resolveFigure, disabled, onAnswer }) {
  const answered = Boolean(verdict);
  const monsterClass = !answered ? "pcg-monster" : verdict.correct ? "pcg-monster pcg-monster-dead" : "pcg-monster pcg-monster-hurt";
  const monsterGlyph = answered ? (verdict.correct ? "💀" : "😈") : monster;
  return (
    <article ref={cardRef} className={`pcg-card${answered ? (verdict.correct ? " pcg-og-cleared" : " pcg-og-failed") : ""}`}>
      <div className="pcg-qtitle">
        <span style={{ color: "#718096", marginRight: 6 }}>{position}.</span>
        {question.text}
        <span className="pcg-monster-wrap"><span className={monsterClass}>{monsterGlyph}</span></span>
      </div>
      <PhysicsChemistryFigure figureIds={question.figureIds} resolve={resolveFigure} />
      <div className="pcg-options">
        {question.options.map((option) => {
          const selected = answer === option.id;
          let cls = "pcg-option";
          if (answered) {
            if (option.id === verdict.correctOptionId) cls += " pcg-opt-correct";
            else if (selected) cls += " pcg-opt-wrong";
          } else if (selected) {
            cls += " pcg-option-selected";
          }
          return (
            <button
              key={option.id}
              type="button"
              className={cls}
              disabled={disabled || answered}
              aria-pressed={selected}
              onClick={() => onAnswer(question.id, option.id)}
            >
              {option.text}
            </button>
          );
        })}
      </div>
      {answered && (
        <div className={`pcg-feedback ${verdict.correct ? "pcg-feedback-correct" : "pcg-feedback-wrong"}`}>
          <strong>{verdict.correct ? "⚔️ 擊敗怪物！答對了" : "💥 怪物反擊！答錯了"}</strong>
          {verdict.explanation && <div className="pcg-exp">💡 <strong>解題觀念：</strong>{verdict.explanation}</div>}
        </div>
      )}
    </article>
  );
}

export function PhysicsChemistryQuiz({ adapter, resolveFigure, title, subtitle, intro, pointsPerQuestion, progress, sync }) {
  const initial = useRef(progress?.activeAttempt ? adapter.restoreAttempt(progress.activeAttempt) : adapter.createAttempt());
  const restored = useRef(Boolean(progress?.activeAttempt));
  const [attempt] = useState(initial.current);
  const size = attempt.questions.length;

  const [answers, setAnswers] = useState(initial.current.answers ?? {});
  const [verdicts, setVerdicts] = useState({});
  const [phase, setPhase] = useState("playing"); // playing | finished
  const [confirmed, setConfirmed] = useState(null);
  const [hud, setHud] = useState({ score: 0, correct: 0, combo: 0, maxCombo: 0 });
  const [muted, setMuted] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const audioRef = useRef(null);
  if (audioRef.current === null) audioRef.current = createGameAudio();
  const rootRef = useRef(null);
  const flashRef = useRef(null);
  const scoreRef = useRef(null);
  const cardRefs = useRef([]);
  const comboRef = useRef(0);
  const initializedRef = useRef(false);
  const finishingRef = useRef(false);

  const monsters = useMemo(() => attempt.questions.map((_, i) => MONSTERS[(i * 5 + 3) % MONSTERS.length]), [attempt]);

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

  function persist(nextAnswers) {
    try {
      sync.queueSave(adapter.serializeProgress({ ...attempt, answers: nextAnswers }));
    } catch (error) {
      setMessage(error?.message === "progress-refresh-required"
        ? "完成紀錄已保存；請重新整理頁面後再開始新的測驗。"
        : "進度尚未同步，稍後會自動重試。");
    }
  }

  async function finish(finalAnswers) {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setBusy(true);
    try {
      persist(finalAnswers);
      await sync.flush();
      const result = adapter.renderResult(await sync.submit(adapter.buildSubmission({ ...attempt, answers: finalAnswers })));
      setConfirmed(result);
      setPhase("finished");
      const tally = tallyFromVerdicts(attempt.questions, finalAnswers, verdicts, pointsPerQuestion);
      setHud({ score: result.score, correct: result.correctCount, combo: 0, maxCombo: tally.maxCombo });
      pulseScore(result.score);
      launchConfetti();
      audioRef.current.fanfare();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error("Physics-chemistry submission failed", error);
      finishingRef.current = false;
      setMessage(error?.message === "progress-refresh-required"
        ? "完成紀錄已保存；請重新整理頁面查看最新進度。"
        : "成績尚未送出，作答已保留；請檢查網路後再點『完成並記錄成績』。");
    } finally {
      setBusy(false);
    }
  }

  // Initial setup: save a fresh attempt, or restore verdicts for a resumed one.
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    if (!restored.current) {
      persist(initial.current.answers ?? {});
      return;
    }
    const answered = initial.current.answers ?? {};
    if (Object.keys(answered).length === 0) return;
    setBusy(true);
    sync.grade(answered)
      .then((restoredVerdicts) => {
        setVerdicts(restoredVerdicts);
        const tally = tallyFromVerdicts(attempt.questions, answered, restoredVerdicts, pointsPerQuestion);
        comboRef.current = tally.combo;
        setHud(tally);
        pulseScore(tally.score);
        if (Object.keys(restoredVerdicts).length >= size) {
          setMessage("這份試卷已全部作答，可按下方『完成並記錄成績』送出。");
        }
      })
      .catch(() => setMessage("已還原你的作答，但需要連線才能顯示對錯與解析，請稍後重試。"))
      .finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== "playing") return undefined;
    const timer = window.setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (typeof sync.onRecoveredSubmission !== "function") return undefined;
    return sync.onRecoveredSubmission(({ result, submission }) => {
      if (submission?.attemptId !== attempt.attemptId) return;
      try {
        const rendered = adapter.renderResult(result);
        setConfirmed(rendered);
        setPhase("finished");
        setHud((h) => ({ ...h, score: rendered.score, correct: rendered.correctCount, combo: 0 }));
        setMessage("完成紀錄已保存。");
      } catch (error) {
        console.error("Recovered physics-chemistry submission could not be displayed", error);
      }
    });
  }, [attempt, sync, adapter]);

  const answerQuestion = async (questionId, optionId) => {
    if (phase !== "playing" || busy) return;
    if (verdicts[questionId]) return; // already answered/locked
    setBusy(true);
    setMessage(null);
    const index = attempt.questions.findIndex((q) => q.id === questionId);
    const card = cardRefs.current[index];
    try {
      const graded = await sync.grade({ [questionId]: optionId });
      const verdict = graded[questionId];
      if (!verdict) throw new Error("grade-missing");
      const nextAnswers = { ...answers, [questionId]: optionId };
      setAnswers(nextAnswers);
      setVerdicts((v) => ({ ...v, [questionId]: verdict }));
      persist(nextAnswers);

      if (verdict.correct) {
        comboRef.current += 1;
        const combo = comboRef.current;
        setHud((h) => {
          const score = h.score + pointsPerQuestion;
          pulseScore(score);
          return { score, correct: h.correct + 1, combo, maxCombo: Math.max(h.maxCombo, combo) };
        });
        spawnFloat(card, `+${pointsPerQuestion}`, combo, false);
        spawnParticles(card);
        flash("green");
        shake();
        audioRef.current.hit(combo);
      } else {
        comboRef.current = 0;
        setHud((h) => ({ ...h, combo: 0 }));
        spawnFloat(card, "MISS", 0, true);
        flash("red");
        audioRef.current.miss();
      }

      if (Object.keys(nextAnswers).length >= size) {
        setBusy(false);
        void finish(nextAnswers);
        return;
      }
    } catch (error) {
      console.error("Grade failed", error);
      setMessage(error?.message === "progress-refresh-required"
        ? "完成紀錄已保存；請重新整理頁面後再繼續。"
        : "需要連線才能即時判定，請確認網路後再點一次。");
    } finally {
      setBusy(false);
    }
  };

  const answeredCount = Object.keys(verdicts).length;
  const progressPct = Math.round((answeredCount / size) * 100);
  const allAnswered = Object.keys(answers).length >= size;
  const rank = phase === "finished" ? rankOf(confirmed ? confirmed.score : hud.score) : null;

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

      {phase === "playing" && <div className="pcg-intro">{intro}</div>}

      {message && (
        <p className="my-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">{message}</p>
      )}

      {phase === "finished" && rank && (
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
        <QuestionCard
          key={question.id}
          cardRef={(el) => { cardRefs.current[index] = el; }}
          monster={monsters[index]}
          position={index + 1}
          question={question}
          answer={answers[question.id]}
          verdict={verdicts[question.id]}
          resolveFigure={resolveFigure}
          disabled={busy || phase !== "playing"}
          onAnswer={answerQuestion}
        />
      ))}

      {phase === "playing" && (
        <button
          type="button"
          className="pcg-submit"
          disabled={busy}
          onClick={() => {
            if (!allAnswered && !window.confirm(`尚有 ${size - Object.keys(answers).length} 隻怪物未挑戰（未作答將計為錯誤），確定要完成並記錄成績嗎？`)) return;
            void finish(answers);
          }}
        >
          {busy ? "處理中…" : allAnswered ? "✅ 完成並記錄成績" : "🏁 直接完成（未答計錯）"}
        </button>
      )}
    </div>
  );
}
