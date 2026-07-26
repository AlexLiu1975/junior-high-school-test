import { useEffect, useMemo, useState } from "react";
import {
  listAttemptsForAccess,
  listStudentsForAccess,
  loadOwnAccess,
  onTeacherAuthStateChanged,
  signInTeacher,
  signOutTeacher,
  submitAccessRequest,
} from "./teacherFirebase.js";
import { getPortalState } from "./teacherDomain.js";

const formatTime = (timestamp) => {
  const date = timestamp?.toDate?.();
  return date
    ? new Intl.DateTimeFormat("zh-TW", {
        timeZone: "Asia/Taipei",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date)
    : "同步中";
};

export default function TeacherApp() {
  const [user, setUser] = useState(null);
  const [request, setRequest] = useState(null);
  const [access, setAccess] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [students, setStudents] = useState([]);
  const [role, setRole] = useState("parent");
  const [studentName, setStudentName] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  const portalState = getPortalState({ user, request, access });

  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    try {
      unsubscribe = onTeacherAuthStateChanged(async (nextUser) => {
        if (!active) return;
        setLoading(true);
        setError("");
        setUser(nextUser);
        setRequest(null);
        setAccess(null);
        setAttempts([]);
        setStudents([]);
        try {
          if (nextUser) {
            const own = await loadOwnAccess(nextUser.uid);
            if (!active) return;
            setRequest(own.request);
            setAccess(own.access);
            const isAdmin = getPortalState({
              user: nextUser,
              request: own.request,
              access: own.access,
            }) === "admin";
            if (isAdmin || own.access) {
              const [nextAttempts, nextStudents] = await Promise.all([
                listAttemptsForAccess(own.access, isAdmin),
                listStudentsForAccess(own.access),
              ]);
              if (!active) return;
              setAttempts(nextAttempts);
              setStudents(nextStudents);
            }
          }
        } catch (caught) {
          console.error(caught);
          if (active) setError("資料載入失敗，請確認帳號權限或稍後重試。");
        } finally {
          if (active) setLoading(false);
        }
      });
    } catch (caught) {
      console.error(caught);
      setError("Firebase 尚未完成設定。");
      setLoading(false);
    }
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const visibleAttempts = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("zh-TW");
    if (!keyword) return attempts;
    return attempts.filter((attempt) =>
      [attempt.studentName, attempt.studentCode, attempt.quizTitle]
        .filter(Boolean)
        .some((value) => value.toLocaleLowerCase("zh-TW").includes(keyword)),
    );
  }, [attempts, search]);

  const apply = async (event) => {
    event.preventDefault();
    setWorking(true);
    setError("");
    try {
      await submitAccessRequest({ user, role, studentName });
      const own = await loadOwnAccess(user.uid);
      setRequest(own.request);
    } catch (caught) {
      console.error(caught);
      setError(role === "parent" ? "請填寫正確的學生姓名。" : "申請送出失敗，請稍後重試。");
    } finally {
      setWorking(false);
    }
  };

  const login = async () => {
    setWorking(true);
    setError("");
    try {
      await signInTeacher();
    } catch (caught) {
      console.error(caught);
      setError("Google 登入未完成。");
    } finally {
      setWorking(false);
    }
  };

  if (loading) return <Page><p>正在載入權限…</p></Page>;

  return (
    <Page>
      <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-emerald-700">測驗管理</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">教師（家長）紀錄頁</h1>
          <p className="mt-2 text-sm text-slate-600">每一次學生作答都會獨立保存。</p>
        </div>
        {user && (
          <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm" onClick={signOutTeacher}>
            登出
          </button>
        )}
      </header>

      {error && <Notice tone="error">{error}</Notice>}

      {portalState === "signed-out" && (
        <section className="rounded-2xl border bg-white p-7 shadow-sm">
          <h2 className="text-xl font-bold">使用 Google 帳號登入</h2>
          <p className="mt-2 text-slate-600">首次登入後，可申請教師或家長查閱權限。</p>
          <button className="mt-6 rounded-lg bg-emerald-700 px-5 py-3 font-semibold text-white disabled:opacity-50" disabled={working} onClick={login}>
            {working ? "登入中…" : "使用 Google 登入"}
          </button>
        </section>
      )}

      {portalState === "apply" && (
        <form className="rounded-2xl border bg-white p-7 shadow-sm" onSubmit={apply}>
          <h2 className="text-xl font-bold">申請查閱權限</h2>
          <p className="mt-1 text-sm text-slate-500">{user.email}</p>
          <label className="mt-6 block font-semibold">身分</label>
          <select className="mt-2 w-full rounded-lg border p-3" value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="parent">家長</option>
            <option value="teacher">教師</option>
          </select>
          {role === "parent" && (
            <>
              <label className="mt-5 block font-semibold">指定學生姓名</label>
              <input className="mt-2 w-full rounded-lg border p-3" maxLength={40} required value={studentName} onChange={(event) => setStudentName(event.target.value)} />
            </>
          )}
          <button className="mt-6 rounded-lg bg-emerald-700 px-5 py-3 font-semibold text-white disabled:opacity-50" disabled={working}>
            {working ? "送出中…" : "送出申請"}
          </button>
        </form>
      )}

      {portalState === "pending" && <Notice>申請已送出，請等候管理員審核。</Notice>}
      {portalState === "rejected" && <Notice tone="error">申請未獲核准，請聯絡管理員後再重新申請。</Notice>}

      {["teacher", "parent", "admin"].includes(portalState) && (
        <>
          <Notice>
            {portalState === "admin" ? "管理員模式：可查看全部測驗紀錄。" : portalState === "teacher" ? "教師權限：可查看全部測驗紀錄。" : "家長權限：只顯示已核准學生的紀錄。"}
          </Notice>
          {students.length > 0 && (
            <section className="mb-5 grid gap-3 sm:grid-cols-2">
              {students.map((student) => (
                <div className="rounded-xl border bg-white p-4" key={student.id}>
                  <p className="font-bold">{student.name}</p>
                  <p className="mt-1 font-mono text-sm text-emerald-800">專屬代碼：{student.code}</p>
                </div>
              ))}
            </section>
          )}
          {portalState === "admin" && (
            <Notice>申請審核功能將在下一階段啟用。</Notice>
          )}
          <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="border-b p-4">
              <input className="w-full rounded-lg border p-3" placeholder="搜尋姓名、代碼或試卷" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-100 text-slate-700">
                  <tr><th className="p-3">時間</th><th className="p-3">學生</th><th className="p-3">試卷</th><th className="p-3">成績</th></tr>
                </thead>
                <tbody>
                  {visibleAttempts.map((attempt) => (
                    <tr className="border-t" key={attempt.id}>
                      <td className="whitespace-nowrap p-3">{formatTime(attempt.submittedAt)}</td>
                      <td className="p-3"><strong>{attempt.studentName}</strong><br /><span className="font-mono text-xs text-slate-500">{attempt.studentCode}</span></td>
                      <td className="p-3">{attempt.quizTitle}</td>
                      <td className="whitespace-nowrap p-3 font-semibold">{attempt.correctCount} / {attempt.totalQuestions}</td>
                    </tr>
                  ))}
                  {visibleAttempts.length === 0 && <tr><td className="p-7 text-center text-slate-500" colSpan={4}>目前沒有符合的測驗紀錄。</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </Page>
  );
}

function Page({ children }) {
  return <main className="min-h-screen bg-stone-100 px-4 py-10 text-slate-800"><div className="mx-auto max-w-5xl">{children}</div></main>;
}

function Notice({ children, tone = "info" }) {
  const style = tone === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-900";
  return <div className={`mb-5 rounded-xl border p-4 ${style}`}>{children}</div>;
}
