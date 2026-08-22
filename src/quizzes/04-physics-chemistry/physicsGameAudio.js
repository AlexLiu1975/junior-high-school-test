// Web Audio sound effects for the game-styled quiz, ported from the original
// 電玩闖關版 source. Created lazily on first user gesture; safe to no-op when the
// browser has no AudioContext or when muted.
export function createGameAudio() {
  let audioCtx = null;
  let muted = false;

  function ac() {
    if (typeof window === "undefined") return null;
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  return {
    setMuted(value) { muted = Boolean(value); },
    isMuted() { return muted; },
    // Defeat sound: higher pitch for higher combo.
    hit(comboLevel = 0) {
      if (muted) return;
      const ctx = ac(); if (!ctx) return;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "square";
      const base = 523 * Math.pow(2, Math.min(comboLevel, 10) / 12);
      o.frequency.setValueAtTime(base, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(base * 2, ctx.currentTime + 0.12);
      g.gain.setValueAtTime(0.18, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.22);
    },
    miss() {
      if (muted) return;
      const ctx = ac(); if (!ctx) return;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(220, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(70, ctx.currentTime + 0.28);
      g.gain.setValueAtTime(0.14, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.3);
    },
    fanfare() {
      if (muted) return;
      const ctx = ac(); if (!ctx) return;
      [523, 659, 784, 1047].forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "triangle";
        const t = ctx.currentTime + i * 0.14;
        o.frequency.setValueAtTime(f, t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.2, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
        o.connect(g); g.connect(ctx.destination);
        o.start(t); o.stop(t + 0.34);
      });
    },
  };
}

export const MONSTERS = ["👾", "👹", "👻", "🐉", "🦠", "🧟", "🤖", "👽", "🦇", "🕷️", "🐙", "🦂", "😈", "🦑", "👺", "💀"];

export function rankOf(score) {
  if (score >= 95) return { badge: "🏆👑", title: "傳說級討伐者", color: "#dd6b20" };
  if (score >= 85) return { badge: "🥇", title: "大師級勇者", color: "#d69e2e" };
  if (score >= 70) return { badge: "🥈", title: "資深冒險者", color: "#3182ce" };
  if (score >= 55) return { badge: "🥉", title: "見習勇者", color: "#38a169" };
  return { badge: "🎯", title: "新手訓練生", color: "#718096" };
}
