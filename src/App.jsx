import React, { useState, useEffect, useCallback } from "react";
import {
  ensureSignedIn,
  loadProgress,
  saveProgress,
  saveQuizAttempt,
  validateStudentEntry,
} from "./firebase";
import {
  buildAttemptRecord,
  createAttemptGuard,
  validateStudentIdentity,
} from "./quizDomain";

/* ---------------------------------------------------------
   資料：第 1 回 第1、2單元 — 細胞與顯微鏡（20題）
--------------------------------------------------------- */
const QUESTIONS = [
  { id: "q1", n: 1, text: "關於英國科學家虎克的敘述，下列何者錯誤？", options: ["他是史上第一位描述細胞的科學家", "他用自製的顯微鏡觀察軟木塞薄片", "他所看見的格狀構造是植物細胞的細胞膜（壁）", "他所發現的細胞已不具生命現象"], correct: 2 },
  { id: "q2", n: 2, text: "當阿拉蕾長時間配戴隱形眼鏡造成眼睛過於乾澀，通常會點上一、兩滴人工淚液以舒緩症狀。請問人工淚液與下列何種液體成分相似，所以可減緩眼睛乾澀的問題？", options: ["礦泉水", "白開水", "生理食鹽水", "濃食鹽水"], correct: 2 },
  { id: "q3", n: 3, text: "下列何種物質不需要經由細胞膜上的蛋白質通道，可以直接利用擴散作用進出細胞？", options: ["二氧化碳", "蛋白質", "礦物質", "葡萄糖"], correct: 0 },
  { id: "q4", n: 4, text: "下列哪一種生物的細胞中不含有葉綠體？", options: ["人類", "榕樹", "大王椰子", "高麗菜"], correct: 0 },
  { id: "q5", n: 5, text: "將動物細胞置入清水時，細胞會膨脹，甚至可能破裂；若將植物細胞置入清水時，細胞僅略為膨脹，這是因為植物有哪一個構造導致此種差異？", options: ["細胞膜", "細胞壁", "葉綠體", "粒線體"], correct: 1 },
  { id: "q6", n: 6, text: "接近考試期間，常有許多人因臨時抱佛腳熬夜唸書，導致早上賴床，來不及吃早餐，而在升旗時，因體力不支而暈倒。當遇到此情況時，學校護理師阿姨常會讓這些學生喝葡萄糖水，請問此目的為何？", options: ["葡萄糖水可被細胞直接利用", "葡萄糖水具有較多的養分", "葡萄糖為構成人體的主要組成成分", "葡萄糖較易轉換成肝糖儲存"], correct: 0 },
  { id: "q7", n: 7, text: "物質進出細胞的模式圖中，甲、乙、丙、丁是物質通過細胞膜的途徑與擴散方向。細胞內進行代謝需要外界的氧氣，代謝形成的二氧化碳須排出細胞。根據前文敘述，氧氣與二氧化碳進出細胞的擴散方向，下列何者正確？", options: ["甲：二氧化碳；乙：氧氣", "乙：氧氣；丁：二氧化碳", "甲：二氧化碳；丙：氧氣", "丙：氧氣；丁：二氧化碳"], correct: 2 },
  { id: "q8", n: 8, text: "構成生物體的基本單位是下列何者？", options: ["細胞", "分子", "原子", "葡萄糖"], correct: 0 },
  { id: "q9", n: 9, text: "細胞質內的哪個構造可以利用葡萄糖，來產生細胞所需的能量？", options: ["細胞核", "液胞（泡）", "粒線體", "細胞膜"], correct: 2 },
  { id: "q10", n: 10, text: "小明發現水蘊草細胞的形狀和軟木栓細胞相似，都很規則且不易變形，這是因為它們都具有何種構造？", options: ["細胞核", "細胞壁", "細胞膜", "細胞質"], correct: 1 },
  { id: "q11", n: 11, text: "下列關於顯微鏡的敘述，何者正確？", options: ["目鏡鏡頭愈短，放大倍率愈小", "光先經過目鏡，再通過物鏡", "放大倍率是目鏡與物鏡倍率相加", "要更換物鏡時可以轉動旋轉盤進行更換"], correct: 3 },
  { id: "q12", n: 12, text: "有關觀察水中小生物的描述，下列何者錯誤？", options: ["一般不需要進行染色", "形狀似草鞋，利用纖毛移動的是草履蟲", "呈綠色且不移動的生物，一般為藻類", "當水中的小生物游出視野外，此時須儘快將物鏡倍數調高，以方便找尋"], correct: 3 },
  { id: "q13", n: 13, text: "複式顯微鏡的調節輪可使我們看清楚物體。請問該如何正確的使用「調節輪」？", options: ["當載玻片放上載物臺時，先使用粗調節輪將低倍物鏡靠近載物臺", "轉動細調節輪時，常需要調大光圈", "通常會先用細調節輪再用粗調節輪", "調節輪可以用來調節光圈的大小"], correct: 0 },
  { id: "q14", n: 14, text: "甲、乙是常用的顯微鏡（甲為解剖顯微鏡、乙為複式顯微鏡），有關這兩臺顯微鏡的敘述與使用時機，下列何者正確？", options: ["最大的放大倍率：甲＜乙", "甲看到的影像較為立體", "乙看到影像的方位與實物相同", "甲、乙皆適合觀察細胞標本"], correct: 2 },
  { id: "q15", n: 15, text: "下列何種生物較適合使用解剖顯微鏡來觀察？", options: ["寬尾鳳蝶的管狀口器", "愛滋病毒", "保衛細胞", "花粉管"], correct: 0 },
  { id: "q16", n: 16, text: "小光用顯微鏡觀察某種生物的細胞，觀察過程中只更換不同倍率的物鏡，光圈大小、光源亮度與標本皆未更動。則下列哪一個視野的亮度最暗？（提示：倍率愈大，亮度愈暗）", options: ["視野 A（低倍率、視野中細胞數目多）", "視野 B", "視野 C（高倍率、視野中細胞數目少、細胞最大）", "視野 D"], correct: 2 },
  { id: "q17", n: 17, text: "關於複式顯微鏡的使用，下列何者是不當的操作？", options: ["取用顯微鏡時要一手握住鏡臂，一手托住鏡座", "使用拭鏡紙擦拭鏡頭時，應朝同一方向擦拭", "轉換觀察倍率時，應轉動旋轉盤更換物鏡倍率", "為了看清楚物體，只需轉動粗調節輪就可以"], correct: 3 },
  { id: "q18", n: 18, text: "有一具複式顯微鏡其目鏡有5X、10X、15X，物鏡有10X、20X、100X，此顯微鏡共有幾種放大倍率？", options: ["6", "7", "8", "9"], correct: 2 },
  { id: "q19", n: 19, text: "使用複式顯微鏡觀察標本時，下列哪一項組合有因果關係？", options: ["縮小光圈──視野變小", "放大光圈──視野變小", "低倍鏡時──視野變大", "高倍鏡時──視野變大"], correct: 2 },
  { id: "q20", n: 20, text: "右圖是解剖顯微鏡觀察已麻醉的蜜蜂之影像，小蓮該如何操作顯微鏡，才能讓蜜蜂在視野正中央？", options: ["更換倍率較高的鏡頭", "轉動調節輪", "將視野亮度調亮", "移動標本"], correct: 3 },
];

const LETTERS = ["A", "B", "C", "D"];
const INTERVALS = [1, 2, 4, 7, 15, 30]; // 艾賓浩斯簡化複習間隔（天）
const QUIZ_ID = "cell-microscope-quiz1";
const QUIZ_TITLE = "第1回 第1、2單元｜細胞與顯微鏡";
const attemptGuard = createAttemptGuard();

const fmtDate = (d) =>
  `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;

const addDays = (base, days) => {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
};

const daysUntil = (dateStr) => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - now) / 86400000);
};

export default function App() {
  const [view, setView] = useState("intro"); // intro | quiz | results
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState({});
  const [progress, setProgress] = useState({});
  const [uid, setUid] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [lastScore, setLastScore] = useState(null);
  const [studentCode, setStudentCode] = useState("");
  const [studentName, setStudentName] = useState("");
  const [verifiedIdentity, setVerifiedIdentity] = useState(null);
  const [identityError, setIdentityError] = useState(null);
  const [starting, setStarting] = useState(false);
  const [runId, setRunId] = useState(null);
  const [finishing, setFinishing] = useState(false);
  const [saveError, setSaveError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const id = await ensureSignedIn();
        setUid(id);
        const data = await loadProgress(id, QUIZ_ID);
        setProgress(data || {});
      } catch (e) {
        console.error("Firebase load failed", e);
        setLoadError("雲端進度同步尚未完成設定；目前仍可正常作答，但重新整理後不會保留進度。");
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const persist = useCallback(
    async (next) => {
      if (!uid) return;
      setSaving(true);
      try {
        await saveProgress(uid, QUIZ_ID, next);
      } catch (e) {
        console.error("Firebase save failed", e);
      } finally {
        setSaving(false);
      }
    },
    [uid]
  );

  const startQuiz = async () => {
    const checked = validateStudentIdentity({ studentName, studentCode });
    if (!checked.valid) {
      setIdentityError(checked.error);
      return;
    }

    setStarting(true);
    setIdentityError(null);
    try {
      const identity = await validateStudentEntry(
        checked.studentCode,
        checked.studentName,
      );
      setVerifiedIdentity(identity);
      setStudentCode(checked.studentCode);
      setStudentName(checked.studentName);
      setRunId(crypto.randomUUID());
      setSaveError(null);
      setAnswers({});
      setCurrent(0);
      setView("quiz");
    } catch {
      setIdentityError("找不到相符的學生資料。");
    } finally {
      setStarting(false);
    }
  };

  const selectOption = (qid, idx) => {
    setAnswers((prev) => ({ ...prev, [qid]: idx }));
  };

  const goNext = () => {
    if (current < QUESTIONS.length - 1) {
      setCurrent((c) => c + 1);
    } else {
      void finishQuiz();
    }
  };

  const goPrev = () => {
    if (current > 0) setCurrent((c) => c - 1);
  };

  const finishQuiz = async () => {
    if (finishing || !verifiedIdentity || !uid || !runId) return;

    setFinishing(true);
    setSaveError(null);
    const today = new Date();
    let correctCount = 0;
    const next = { ...progress };

    QUESTIONS.forEach((q) => {
      const picked = answers[q.id];
      const wasCorrect = picked === q.correct;
      if (wasCorrect) correctCount += 1;

      const prevEntry = next[q.id] || { errorCount: 0, stage: -1 };
      if (wasCorrect) {
        const stage = Math.min(prevEntry.stage + 1, INTERVALS.length - 1);
        next[q.id] = {
          errorCount: prevEntry.errorCount,
          stage,
          lastResult: "correct",
          lastAttempt: fmtDate(today),
          nextReview: fmtDate(addDays(today, INTERVALS[stage])),
        };
      } else {
        next[q.id] = {
          errorCount: prevEntry.errorCount + 1,
          stage: 0,
          lastResult: "wrong",
          lastAttempt: fmtDate(today),
          nextReview: fmtDate(addDays(today, INTERVALS[0])),
        };
      }
    });

    setProgress(next);
    setLastScore(correctCount);
    setView("results");

    const writes = [persist(next)];
    if (attemptGuard.claim(runId)) {
      writes.push(
        saveQuizAttempt(
          buildAttemptRecord({
            identity: verifiedIdentity,
            uid,
            quizId: QUIZ_ID,
            quizTitle: QUIZ_TITLE,
            correctCount,
            totalQuestions: QUESTIONS.length,
          }),
        ),
      );
    }

    const results = await Promise.allSettled(writes);
    if (results.some((result) => result.status === "rejected")) {
      setSaveError("部分作答紀錄未能儲存，請檢查網路後重新整理。");
    }
    setFinishing(false);
  };

  const resetProgress = async () => {
    setProgress({});
    setAnswers({});
    setLastScore(null);
    await persist({});
    setView("intro");
  };

  const wrongIds = QUESTIONS.filter((q) => answers[q.id] !== q.correct).map((q) => q.id);

  const reviewList = Object.entries(progress)
    .filter(([, v]) => v.errorCount > 0)
    .map(([id, v]) => {
      const q = QUESTIONS.find((qq) => qq.id === id);
      return { id, n: q ? q.n : "?", text: q ? q.text : "", ...v, daysLeft: daysUntil(v.nextReview) };
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

  if (!loaded) {
    return (
      <div style={{ ...fontStyle, background: "#1F2E23" }} className="min-h-screen flex items-center justify-center">
        <p style={{ color: PAPER }} className="text-sm tracking-wide">
          載入中…
        </p>
      </div>
    );
  }

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
              {view === "results" ? `${lastScore * 5}` : "20題"}
            </span>
          </div>
        </div>

        <div className="paper-lines rounded-b-md px-5 sm:px-7 py-6" style={{ background: PAPER }}>
          {loadError && (
            <div className="mb-5 rounded px-4 py-3 text-sm" style={{ background: "rgba(178,58,46,0.08)", border: "1px solid #E3B0A8", color: RED }}>
              {loadError}
            </div>
          )}
          {saveError && (
            <div className="mb-5 rounded px-4 py-3 text-sm" style={{ background: "rgba(178,58,46,0.08)", border: "1px solid #E3B0A8", color: RED }}>
              {saveError}
            </div>
          )}

          {view === "intro" && (
            <IntroView
              onStart={startQuiz}
              studentCode={studentCode}
              studentName={studentName}
              onStudentCodeChange={setStudentCode}
              onStudentNameChange={setStudentName}
              identityError={identityError}
              starting={starting}
              progress={progress}
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
              question={QUESTIONS[current]}
              index={current}
              total={QUESTIONS.length}
              selected={answers[QUESTIONS[current].id]}
              onSelect={(idx) => selectOption(QUESTIONS[current].id, idx)}
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
              score={lastScore}
              studentName={verifiedIdentity?.studentName}
              wrongIds={wrongIds}
              answers={answers}
              reviewList={reviewList}
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
          {saving ? "儲存進度中…" : "作答紀錄會同步儲存到 Firebase"}
        </p>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   Intro
--------------------------------------------------------- */
function IntroView({
  onStart,
  studentCode,
  studentName,
  onStudentCodeChange,
  onStudentNameChange,
  identityError,
  starting,
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

      <div className="space-y-3 mb-5">
        <label className="block">
          <span style={{ color: INKDARK }} className="block text-sm font-bold mb-1">
            學生專屬代碼
          </span>
          <input
            value={studentCode}
            onChange={(event) => onStudentCodeChange(event.target.value)}
            placeholder="例如：20260726-001"
            autoComplete="off"
            className="w-full rounded border bg-white px-3 py-2.5 text-sm"
            style={{ borderColor: "#C9BFA8", color: INKDARK }}
          />
        </label>
        <label className="block">
          <span style={{ color: INKDARK }} className="block text-sm font-bold mb-1">
            測試人姓名
          </span>
          <input
            value={studentName}
            onChange={(event) => onStudentNameChange(event.target.value)}
            maxLength={40}
            autoComplete="name"
            className="w-full rounded border bg-white px-3 py-2.5 text-sm"
            style={{ borderColor: "#C9BFA8", color: INKDARK }}
          />
        </label>
        <p style={{ color: "#6f675b" }} className="text-xs">
          姓名與專屬代碼只用於辨識本次測驗及保存歷次成績。
        </p>
        {identityError && (
          <p role="alert" style={{ color: RED }} className="text-sm">
            {identityError}
          </p>
        )}
      </div>

      {attempted > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <StatBox label="已作答題數" value={attempted} INK={INK} INKDARK={INKDARK} monoStyle={monoStyle} />
          <StatBox label="累計錯誤次數" value={totalErrors} INK={RED} INKDARK={INKDARK} monoStyle={monoStyle} />
          <StatBox label="今日待複習" value={reviewCount} INK={GREEN} INKDARK={INKDARK} monoStyle={monoStyle} />
        </div>
      )}

      <button
        onClick={onStart}
        disabled={starting}
        style={{ background: INK, ...serifStyle }}
        className="w-full py-3.5 rounded text-white font-bold text-base hover:opacity-90 transition disabled:opacity-50"
      >
        {starting ? "驗證中…" : attempted > 0 ? "重新測驗" : "開始測驗"}
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
        第 {question.n} 題 ／ 共 {total} 題
      </p>
      <p style={{ color: INKDARK }} className="text-base leading-relaxed mb-5 font-medium">
        {question.text}
      </p>

      <div className="space-y-2.5 mb-7">
        {question.options.map((opt, idx) => {
          const isSelected = selected === idx;
          return (
            <button
              key={idx}
              onClick={() => onSelect(idx)}
              className="w-full text-left flex items-start gap-3 px-4 py-3 rounded transition"
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
                {opt}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex gap-3">
        <button onClick={onPrev} disabled={index === 0} style={{ ...serifStyle, color: INKDARK, borderColor: "#C9BFA8" }} className="px-4 py-2.5 rounded border text-sm font-bold disabled:opacity-30">
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
function ResultsView({ score, studentName, wrongIds, answers, reviewList, onRetry, onReset, serifStyle, monoStyle, INK, RED, GREEN, INKDARK }) {
  const wrongQuestions = QUESTIONS.filter((q) => wrongIds.includes(q.id));

  return (
    <div>
      <div className="text-center mb-6">
        <p style={{ color: INKDARK }} className="text-sm font-bold mb-2">
          測試人：{studentName}
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
          答對 {score} 題，答錯 {20 - score} 題
        </p>
      </div>

      {wrongQuestions.length > 0 ? (
        <div className="mb-7">
          <h3 style={{ ...serifStyle, color: RED }} className="text-sm font-bold mb-3 flex items-center gap-2">
            <span className="pen-circle-red w-5 h-5 flex items-center justify-center text-[10px]" style={{ ...monoStyle, color: RED }}>
              ✕
            </span>
            錯題標示（{wrongQuestions.length} 題）
          </h3>
          <div className="space-y-3">
            {wrongQuestions.map((q) => (
              <div key={q.id} className="rounded border px-4 py-3" style={{ borderColor: "#E3B0A8", background: "rgba(178,58,46,0.05)" }}>
                <p style={{ ...monoStyle, color: RED }} className="text-[11px] mb-1">
                  第 {q.n} 題 ・ 累計錯誤 {reviewList.find((r) => r.id === q.id)?.errorCount || 1} 次
                </p>
                <p style={{ color: INKDARK }} className="text-sm mb-2">
                  {q.text}
                </p>
                <p style={{ color: INKDARK }} className="text-xs">
                  你的答案：
                  <span style={{ color: RED }} className="font-bold">
                    {" "}
                    {answers[q.id] !== undefined ? `(${LETTERS[answers[q.id]]}) ${q.options[answers[q.id]]}` : "未作答"}
                  </span>
                </p>
                <p style={{ color: INKDARK }} className="text-xs mt-0.5">
                  正確答案：
                  <span style={{ color: GREEN }} className="font-bold">
                    {" "}
                    ({LETTERS[q.correct]}) {q.options[q.correct]}
                  </span>
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p style={{ color: GREEN, ...serifStyle }} className="text-center font-bold mb-7">
          全部答對！太棒了 🌿
        </p>
      )}

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
                    第 {r.n} 題
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
        <button onClick={onReset} style={{ ...serifStyle, color: INKDARK, borderColor: "#C9BFA8" }} className="px-4 py-2.5 rounded border text-sm font-bold">
          清除紀錄
        </button>
        <button onClick={onRetry} style={{ ...serifStyle, background: INK }} className="flex-1 py-2.5 rounded text-white text-sm font-bold">
          重新測驗
        </button>
      </div>
    </div>
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
