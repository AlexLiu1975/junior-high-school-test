import { useCallback, useEffect, useRef, useState } from "react";
import {
  ensureSignedIn,
  gradeQuizAnswers,
  loadStudentProgress,
  saveStudentProgress,
  submitQuizAttempt,
} from "./firebase.js";
import HomeLink from "./HomeLink.jsx";
import ProgressConflictDialog from "./ProgressConflictDialog.jsx";
import { validateStudentIdentity } from "./quizDomain.js";
import {
  buildTrustedGradeRequest,
  buildTrustedProgressRequest,
  buildTrustedSubmissionRequest,
  classifyStudentSyncError,
  createStudentSyncClient,
  recoverStudentSyncOnline,
  refreshProgressAfterSubmission,
  resolveProgressConflict,
  toLocalProgressSnapshot,
  submitWithProgressRefresh,
  matchesStudentSessionScope,
} from "./studentSyncDomain.js";
import SyncStatus from "./SyncStatus.jsx";

export default function StudentQuizShell({ quiz, moduleLoader = null }) {
  const [studentCode, setStudentCode] = useState("");
  const [studentName, setStudentName] = useState("");
  const [status, setStatus] = useState(null);
  const [session, setSession] = useState(null);
  const [conflict, setConflict] = useState(null);
  const [Renderer, setRenderer] = useState(null);
  const mountedRef = useRef(true);
  const clientRef = useRef(null);
  const credentialsRef = useRef(null);
  const rendererRef = useRef(null);
  const sessionRef = useRef(null);
  const refreshRequiredRef = useRef(false);
  const recoveredSubmissionHandlerRef = useRef(null);
  const sessionTokenCounterRef = useRef(0);
  const activeSessionTokenRef = useRef(null);

  const applySyncReadiness = useCallback((identity) => {
    const client = clientRef.current;
    if (!client || !identity) return null;
    const readiness = client.getReadiness(identity.studentId, quiz.id);
    if (!mountedRef.current) return readiness;
    if (refreshRequiredRef.current) {
      setStatus("refresh-required");
    } else if (readiness.status === "synced") {
      setStatus("synced");
    } else if (readiness.status === "pending-attempt") {
      setStatus("submit-failed");
    } else {
      setStatus("local-pending");
    }
    return readiness;
  }, [quiz.id]);

  const isCurrentSession = useCallback(({ client, token, studentId, quizId }) => (
    matchesStudentSessionScope({
      mounted: mountedRef.current,
      currentClient: clientRef.current,
      client,
      activeToken: activeSessionTokenRef.current,
      token,
      currentSession: sessionRef.current,
      studentId,
      quizId,
    })
  ), []);

  const refreshConfirmedSubmission = useCallback(async ({
    result,
    currentSession,
    client,
    credentials,
  }) => {
    const scope = {
      client,
      token: currentSession.token,
      studentId: currentSession.identity.studentId,
      quizId: currentSession.quizId,
    };
    const outcome = await submitWithProgressRefresh({
      submit: async () => result,
      refresh: () => refreshProgressAfterSubmission({
        loadProgress: loadStudentProgress,
        client,
        credentials,
        identity: currentSession.identity,
        quiz,
        isCurrent: () => isCurrentSession(scope),
      }),
    });
    if (!isCurrentSession(scope)) {
      return { delivered: false, refreshError: outcome.refreshError };
    }
    if (outcome.refreshError) {
      refreshRequiredRef.current = true;
      setStatus("refresh-required");
      return { delivered: true, refreshError: outcome.refreshError };
    }
    refreshRequiredRef.current = false;
    const nextSession = { ...sessionRef.current, progress: outcome.refreshedProgress };
    sessionRef.current = nextSession;
    setSession(nextSession);
    applySyncReadiness(currentSession.identity);
    return { delivered: true, refreshError: null };
  }, [applySyncReadiness, isCurrentSession, quiz]);

  useEffect(() => {
    mountedRef.current = true;
    const retryWhenOnline = () => {
      const currentSession = sessionRef.current;
      const client = clientRef.current;
      const credentials = credentialsRef.current;
      if (!client || !currentSession) return;
      void recoverStudentSyncOnline({
        client,
        studentId: currentSession.identity.studentId,
        quizId: quiz.id,
        allowSubmitRetry: rendererRef.current !== null,
        buildSubmissionRequest: (submission) => buildTrustedSubmissionRequest({
          submission,
          credentials,
          identity: currentSession.identity,
          quiz,
        }),
      })
        .then(async (recovery) => {
          if (recovery.recoveredSubmission) {
            const completion = await refreshConfirmedSubmission({
              result: recovery.recoveredSubmission.result,
              currentSession,
              client,
              credentials,
            });
            if (completion.delivered) {
              recoveredSubmissionHandlerRef.current?.({
                ...recovery.recoveredSubmission,
                refreshRequired: completion.refreshError !== null,
              });
            }
            return;
          }
          if (isCurrentSession({
            client,
            token: currentSession.token,
            studentId: currentSession.identity.studentId,
            quizId: currentSession.quizId,
          })) {
            applySyncReadiness(currentSession.identity);
          }
        })
        .catch((error) => {
          if (isCurrentSession({
            client,
            token: currentSession.token,
            studentId: currentSession.identity.studentId,
            quizId: currentSession.quizId,
          })) {
            setStatus(
              refreshRequiredRef.current
                ? "refresh-required"
                : classifyStudentSyncError(error),
            );
          }
        });
    };
    window.addEventListener("online", retryWhenOnline);
    return () => {
      mountedRef.current = false;
      activeSessionTokenRef.current = null;
      sessionTokenCounterRef.current += 1;
      sessionRef.current = null;
      window.removeEventListener("online", retryWhenOnline);
      clientRef.current?.dispose();
    };
  }, [applySyncReadiness, isCurrentSession, quiz, refreshConfirmedSubmission]);

  function requestForProgress(progress) {
    return buildTrustedProgressRequest({
      progress,
      credentials: credentialsRef.current,
      quiz,
    });
  }

  async function enterQuiz(identity, progress, shouldSyncLocal = false) {
    if (shouldSyncLocal) {
      clientRef.current.queueSave({
        studentId: identity.studentId,
        quizId: quiz.id,
        progress,
        request: requestForProgress(progress),
      });
    }
    setConflict(null);
    const nextSession = {
      identity,
      progress,
      token: activeSessionTokenRef.current,
      quizId: quiz.id,
    };
    sessionRef.current = nextSession;
    setSession(nextSession);
    if (!moduleLoader) {
      setStatus("unavailable");
      return;
    }
    setStatus("loading");
    try {
      const loadedModule = await moduleLoader();
      if (!mountedRef.current) return;
      if (typeof loadedModule?.default !== "function") {
        throw new Error("quiz-renderer-unavailable");
      }
      setRenderer(() => loadedModule.default);
      rendererRef.current = loadedModule.default;
      applySyncReadiness(identity);
    } catch (error) {
      console.error("Quiz renderer load failed", error);
      if (mountedRef.current) setStatus("unavailable");
    }
  }

  async function startQuiz(event) {
    event.preventDefault();
    const checked = validateStudentIdentity({ studentCode, studentName });
    if (!checked.valid) {
      setStatus("bad-identity");
      return;
    }

    setStatus("loading");
    try {
      await ensureSignedIn();
      const credentials = {
        studentCode: checked.studentCode,
        studentName: checked.studentName,
      };
      const cloudProgress = await loadStudentProgress({
        ...credentials,
        quizId: quiz.id,
        quizVersion: quiz.version,
      });
      if (typeof cloudProgress?.studentId !== "string" || !cloudProgress.studentId) {
        throw Object.assign(new Error("student-entry-not-found"), {
          code: "functions/permission-denied",
        });
      }
      if (
        cloudProgress.quizId !== quiz.id
        || cloudProgress.quizVersion !== quiz.version
      ) {
        throw Object.assign(new Error("invalid-quiz-version"), {
          code: "functions/invalid-argument",
        });
      }
      if (!mountedRef.current) return;

      credentialsRef.current = credentials;
      const identity = { studentId: cloudProgress.studentId };
      clientRef.current?.dispose();
      activeSessionTokenRef.current = ++sessionTokenCounterRef.current;
      clientRef.current = createStudentSyncClient({
        storage: window.localStorage,
        callSave: saveStudentProgress,
        callSubmit: submitQuizAttempt,
        onSaveState: (saveState) => {
          if (!mountedRef.current) return;
          if (["pending", "progress-pending", "pending-attempt", "synced"].includes(saveState.status)) {
            applySyncReadiness(identity);
          } else if (saveState.errorState === "progress-conflict") {
            void reloadProgressConflict(identity);
          } else if (saveState.status === "error") {
            setStatus(saveState.errorState === "unknown" ? "local-pending" : saveState.errorState);
          }
        },
      });
      refreshRequiredRef.current = false;
      const local = clientRef.current.load(identity.studentId, quiz.id);
      if (local?.quizVersion !== undefined && local.quizVersion !== quiz.version) {
        throw Object.assign(new Error("invalid-local-quiz-version"), {
          code: "functions/invalid-argument",
        });
      }
      const cloud = toLocalProgressSnapshot(cloudProgress, { pendingSync: false });
      const resolution = resolveProgressConflict({ local, cloud });

      setStudentCode("");
      setStudentName("");
      if (resolution.mode === "choice") {
        setConflict({ ...resolution, identity });
        setStatus("conflict");
        return;
      }
      if (resolution.mode === "cloud") {
        clientRef.current.replaceLocalProgress({
          studentId: identity.studentId,
          quizId: quiz.id,
          progress: resolution.value,
        });
      }
      await enterQuiz(identity, resolution.value, resolution.mode === "local" && local?.pendingSync);
    } catch (error) {
      console.error("Student quiz load failed", error);
      if (mountedRef.current) setStatus(classifyStudentSyncError(error));
    }
  }

  async function reloadProgressConflict(identity) {
    try {
      const cloudProgress = await loadStudentProgress({
        ...credentialsRef.current,
        quizId: quiz.id,
        quizVersion: quiz.version,
      });
      if (!mountedRef.current) return;
      const local = clientRef.current.load(identity.studentId, quiz.id);
      const cloud = toLocalProgressSnapshot(cloudProgress, { pendingSync: false });
      if (!local) {
        clientRef.current.replaceLocalProgress({
          studentId: identity.studentId,
          quizId: quiz.id,
          progress: cloud,
        });
        await enterQuiz(identity, cloud);
        return;
      }
      rendererRef.current = null;
      sessionRef.current = null;
      setRenderer(null);
      setSession(null);
      setConflict({ mode: "choice", local, cloud, identity });
      setStatus("conflict");
    } catch (error) {
      if (mountedRef.current) setStatus(classifyStudentSyncError(error));
    }
  }

  function chooseProgress(source) {
    const value = source === "local"
      ? { ...conflict.local, revision: conflict.cloud.revision }
      : conflict.cloud;
    clientRef.current.replaceLocalProgress({
      studentId: conflict.identity.studentId,
      quizId: quiz.id,
      progress: value,
    });
    void enterQuiz(conflict.identity, value, source === "local");
  }

  const syncCallbacks = session && clientRef.current
    ? {
        queueSave(nextProgress) {
          if (refreshRequiredRef.current) {
            setStatus("refresh-required");
            throw new Error("progress-refresh-required");
          }
          const storedProgress = clientRef.current.load(session.identity.studentId, quiz.id);
          const versionedProgress = {
            ...nextProgress,
            revision: storedProgress?.revision ?? 0,
            quizVersion: quiz.version,
            kind: quiz.kind,
          };
          clientRef.current.queueSave({
            studentId: session.identity.studentId,
            quizId: quiz.id,
            progress: versionedProgress,
            request: requestForProgress(versionedProgress),
          });
          setSession((current) => {
            const nextSession = { ...current, progress: versionedProgress };
            sessionRef.current = nextSession;
            return nextSession;
          });
        },
        async flush() {
          try {
            const result = await clientRef.current.flush();
            applySyncReadiness(session.identity);
            return result;
          } catch (error) {
            if (mountedRef.current) setStatus(classifyStudentSyncError(error));
            throw error;
          }
        },
        async submit(submission) {
          setStatus("submitting");
          const currentSession = session;
          const client = clientRef.current;
          const credentials = credentialsRef.current;
          const request = buildTrustedSubmissionRequest({
            submission,
            credentials,
            identity: currentSession.identity,
            quiz,
          });
          try {
            const result = await client.submit({
              studentId: currentSession.identity.studentId,
              quizId: quiz.id,
              submission: request,
              request,
            });
            const completion = await refreshConfirmedSubmission({
              result,
              currentSession,
              client,
              credentials,
            });
            if (!completion.delivered) {
              throw new Error("student-session-changed");
            }
            return result;
          } catch (error) {
            if (isCurrentSession({
              client,
              token: currentSession.token,
              studentId: currentSession.identity.studentId,
              quizId: currentSession.quizId,
            })) {
              const errorState = classifyStudentSyncError(error);
              setStatus(errorState === "unknown" ? "submit-failed" : errorState);
            }
            throw error;
          }
        },
        loadPendingAttempt() {
          return clientRef.current.loadPendingAttempt(session.identity.studentId, quiz.id);
        },
        // Live per-question grading for immediate feedback. Read-only on the
        // server (records nothing); the authoritative attempt is still written
        // by submit(). Answer keys never reach the browser.
        async grade(answers) {
          const request = buildTrustedGradeRequest({
            answers,
            credentials: credentialsRef.current,
            identity: session.identity,
            quiz,
          });
          const response = await gradeQuizAnswers(request);
          return response?.verdicts ?? {};
        },
        onRecoveredSubmission(handler) {
          recoveredSubmissionHandlerRef.current = handler;
          return () => {
            if (recoveredSubmissionHandlerRef.current === handler) {
              recoveredSubmissionHandlerRef.current = null;
            }
          };
        },
      }
    : null;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-900 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <nav className="mb-5 flex flex-wrap gap-3 text-sm">
          <a href={`${import.meta.env.BASE_URL}quiz.html`} className="font-bold text-emerald-200 hover:text-white">
            ← 返回試卷選單
          </a>
          <HomeLink variant="quiz" />
        </nav>
        <section className="rounded-3xl bg-[#f8f5ec] p-5 shadow-2xl sm:p-8">
          <header className="border-b border-slate-200 pb-5">
            <p className="text-xs font-bold tracking-[0.2em] text-emerald-800">{quiz.subject}</p>
            <h1 className="mt-2 font-serif text-2xl font-bold sm:text-3xl">{quiz.title}</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">{quiz.catalogDescription}</p>
          </header>

          <div className="mt-5">
            <SyncStatus status={status} />
          </div>

          {!session && !conflict && (
            <form onSubmit={startQuiz} className="mt-6 space-y-4">
              <label className="block">
                <span className="mb-1 block text-sm font-bold">學生專屬代碼</span>
                <input
                  value={studentCode}
                  onChange={(event) => setStudentCode(event.target.value)}
                  autoComplete="off"
                  placeholder="例如：20260726-001"
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-bold">學生姓名</span>
                <input
                  value={studentName}
                  onChange={(event) => setStudentName(event.target.value)}
                  autoComplete="name"
                  maxLength={40}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3"
                />
              </label>
              <p className="text-xs leading-5 text-slate-500">
                姓名與專屬代碼只在本次頁面中送至雲端驗證，不會寫入瀏覽器的永久儲存空間。
              </p>
              <button
                type="submit"
                disabled={status === "loading"}
                className="w-full rounded-xl bg-emerald-900 px-5 py-3 font-bold text-white disabled:opacity-50"
              >
                {status === "loading" ? "驗證中…" : "驗證並開啟試卷"}
              </button>
            </form>
          )}

          {conflict && (
            <div className="mt-6">
              <ProgressConflictDialog
                quiz={quiz}
                local={conflict.local}
                cloud={conflict.cloud}
                onChoose={chooseProgress}
              />
            </div>
          )}

          {session && Renderer && (
            <div className="mt-6">
              <Renderer
                identity={session.identity}
                progress={session.progress}
                sync={syncCallbacks}
              />
            </div>
          )}

          {session && !Renderer && status === "unavailable" && (
            <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="font-bold">試卷內容尚未載入</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                學生資料已完成驗證，但這份試卷的作答畫面仍在建置中。你的姓名與代碼沒有保存在瀏覽器中。
              </p>
            </section>
          )}
        </section>
      </div>
    </main>
  );
}
