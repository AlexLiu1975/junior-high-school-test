const STORAGE_SEGMENT_PATTERN = /^[A-Za-z0-9_-]{1,160}$/;

function isRawIdentityField(key) {
  const normalized = String(key).toLowerCase().replace(/[_\-\s]/g, "");
  return normalized === "studentname" || normalized === "studentcode";
}

function requireStorageSegment(value) {
  if (typeof value !== "string" || !STORAGE_SEGMENT_PATTERN.test(value)) {
    throw new Error("invalid-storage-key-segment");
  }
  return value;
}

export function progressStorageKey(studentId, quizId) {
  return `jhst:progress:${requireStorageSegment(studentId)}:${requireStorageSegment(quizId)}`;
}

export function pendingAttemptStorageKey(studentId, quizId) {
  return `jhst:pending-attempt:${requireStorageSegment(studentId)}:${requireStorageSegment(quizId)}`;
}

function containsRawIdentity(value, seen = new Set()) {
  if (value === null || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) {
    return value.some((child) => containsRawIdentity(child, seen));
  }
  return Object.entries(value).some(([key, child]) => (
    isRawIdentityField(key) || containsRawIdentity(child, seen)
  ));
}

function withoutRawIdentity(value) {
  if (Array.isArray(value)) return value.map(withoutRawIdentity);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !isRawIdentityField(key))
        .map(([key, child]) => [key, withoutRawIdentity(child)]),
    );
  }
  return value;
}

function cloneSerializable(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createLocalProgressStore(storage) {
  if (
    typeof storage?.getItem !== "function"
    || typeof storage?.setItem !== "function"
    || typeof storage?.removeItem !== "function"
  ) {
    throw new Error("storage-unavailable");
  }

  return {
    load(key) {
      const raw = storage.getItem(key);
      if (raw === null) return null;
      try {
        return JSON.parse(raw);
      } catch {
        storage.removeItem(key);
        return null;
      }
    },

    save(key, value) {
      if (containsRawIdentity(value)) {
        throw new Error("raw-student-identity-not-allowed");
      }
      storage.setItem(key, JSON.stringify(value));
      return value;
    },

    remove(key) {
      storage.removeItem(key);
    },
  };
}

function timestampToMs(value) {
  if (Number.isFinite(value?.updatedAtMs)) return value.updatedAtMs;
  if (typeof value?.updatedAt?.toMillis === "function") {
    return value.updatedAt.toMillis();
  }
  const seconds = value?.updatedAt?.seconds ?? value?.updatedAt?._seconds;
  const nanoseconds = value?.updatedAt?.nanoseconds ?? value?.updatedAt?._nanoseconds ?? 0;
  if (Number.isFinite(seconds) && Number.isFinite(nanoseconds)) {
    return (seconds * 1_000) + Math.floor(nanoseconds / 1_000_000);
  }
  return 0;
}

export function toLocalProgressSnapshot(progress, { pendingSync, now = Date.now } = {}) {
  const updatedAtMs = pendingSync === true ? now() : timestampToMs(progress);
  return {
    updatedAtMs,
    pendingSync: pendingSync === true,
    revision: Number.isSafeInteger(progress?.revision) && progress.revision >= 0
      ? progress.revision
      : 0,
    quizVersion: progress?.quizVersion,
    kind: progress?.kind,
    activeAttempt: cloneSerializable(progress?.activeAttempt ?? null),
    reviewProgress: cloneSerializable(progress?.reviewProgress ?? {}),
  };
}

export function resolveProgressConflict({ local, cloud }) {
  if (!local && !cloud) return { mode: "cloud", value: null };
  if (!local) return { mode: "cloud", value: cloud };
  if (!cloud) return { mode: "local", value: local };

  if (local.pendingSync === true && local.updatedAtMs > timestampToMs(cloud)) {
    return { mode: "choice", local, cloud };
  }
  if (local.updatedAtMs > timestampToMs(cloud)) {
    return { mode: "local", value: local };
  }
  return { mode: "cloud", value: cloud };
}

function errorText(error) {
  return `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase();
}

export function classifyStudentSyncError(error) {
  const code = String(error?.code ?? "").toLowerCase();
  const text = errorText(error);
  if (text.includes("firebase configuration is missing")) return "missing-config";
  if (text.includes("progress-conflict")) return "progress-conflict";
  if (text.includes("invalid-quiz") || text.includes("version")) return "version-mismatch";
  if (text.includes("student-inactive")) return "inactive-student";
  if (
    text.includes("invalid-student-identity")
    || text.includes("student-entry-not-found")
  ) return "bad-identity";
  if (
    code.includes("unavailable")
    || code.includes("deadline-exceeded")
    || text.includes("network-request-failed")
  ) return "offline-pending";
  if (code.includes("permission-denied")) return "permission-denied";
  if (code.includes("invalid-argument")) return "bad-identity";
  return "unknown";
}

export function buildTrustedSubmissionRequest({ submission, credentials, identity, quiz }) {
  const safeSubmission = withoutRawIdentity(cloneSerializable(submission));
  return {
    ...safeSubmission,
    studentId: identity.studentId,
    quizId: quiz.id,
    quizVersion: quiz.version,
    title: quiz.title,
    subject: quiz.subject,
    kind: quiz.kind,
    studentCode: credentials.studentCode,
    studentName: credentials.studentName,
  };
}

export function buildTrustedProgressRequest({ progress, credentials, quiz }) {
  return {
    studentCode: credentials.studentCode,
    studentName: credentials.studentName,
    quizId: quiz.id,
    quizVersion: quiz.version,
    baseRevision: Number.isSafeInteger(progress?.revision) && progress.revision >= 0
      ? progress.revision
      : 0,
    activeAttempt: withoutRawIdentity(cloneSerializable(progress?.activeAttempt ?? null)),
    reviewProgress: withoutRawIdentity(cloneSerializable(progress?.reviewProgress ?? {})),
  };
}

export function createStudentSyncClient({
  storage,
  callSave,
  callSubmit,
  debounceMs = 350,
  now = Date.now,
  schedule = setTimeout,
  cancel = clearTimeout,
  createToken = null,
  onSaveState = null,
}) {
  if (typeof callSave !== "function" || typeof callSubmit !== "function") {
    throw new Error("student-callables-required");
  }
  const store = createLocalProgressStore(storage);
  let queuedSave = null;
  let activeSave = null;
  let timer = null;
  let disposed = false;
  let generation = 0;
  let retryNeeded = false;
  let submissionSequence = 0;

  function getReadiness(studentId, quizId) {
    if (queuedSave || activeSave || timer !== null || retryNeeded) {
      return { status: "progress-pending" };
    }
    if (store.load(pendingAttemptStorageKey(studentId, quizId))) {
      return { status: "pending-attempt" };
    }
    return { status: "synced" };
  }

  function emitSaveState(status, details = {}) {
    if (!disposed && typeof onSaveState === "function") {
      onSaveState({ status, ...details });
    }
  }

  function clearTimer() {
    if (timer !== null) cancel(timer);
    timer = null;
  }

  function scheduleSave(delay = debounceMs) {
    if (disposed || timer !== null || activeSave || !queuedSave || retryNeeded) return;
    timer = schedule(() => {
      timer = null;
      void runQueuedSave().catch(() => {});
    }, delay);
  }

  function runQueuedSave() {
    if (activeSave) return activeSave;
    if (!queuedSave || disposed) return Promise.resolve(null);
    clearTimer();
    const job = queuedSave;
    queuedSave = null;
    let didAcknowledge = false;
    let acknowledgedResult = null;

    const operation = (async () => {
      try {
        const result = await callSave(job.request);
        if (!disposed && queuedSave && Number.isSafeInteger(result?.revision)) {
          queuedSave = {
            ...queuedSave,
            progress: { ...queuedSave.progress, revision: result.revision },
            request: { ...queuedSave.request, baseRevision: result.revision },
          };
          store.save(
            queuedSave.key,
            toLocalProgressSnapshot(queuedSave.progress, { pendingSync: true, now }),
          );
        }
        if (!disposed && generation === job.generation) {
          const acknowledged = {
            ...job.progress,
            ...result,
            updatedAtMs: result?.updatedAtMs,
          };
          store.save(
            job.key,
            toLocalProgressSnapshot(acknowledged, { pendingSync: false, now }),
          );
          didAcknowledge = true;
          acknowledgedResult = result;
        }
        return result;
      } catch (error) {
        if (!disposed && !queuedSave) {
          queuedSave = job;
          retryNeeded = true;
        }
        if (!disposed && generation === job.generation) {
          emitSaveState("error", {
            error,
            errorState: classifyStudentSyncError(error),
          });
        }
        throw error;
      }
    })();

    activeSave = operation.finally(() => {
      activeSave = null;
      if (queuedSave) {
        scheduleSave(0);
      } else if (didAcknowledge && !disposed) {
        emitSaveState(getReadiness(job.studentId, job.quizId).status, {
          result: acknowledgedResult,
        });
      }
    });
    return activeSave;
  }

  return {
    load(studentId, quizId) {
      return store.load(progressStorageKey(studentId, quizId));
    },

    loadPendingAttempt(studentId, quizId) {
      return store.load(pendingAttemptStorageKey(studentId, quizId));
    },

    getReadiness,

    replaceLocalProgress({ studentId, quizId, progress }) {
      if (disposed) throw new Error("student-sync-client-disposed");
      generation += 1;
      retryNeeded = false;
      clearTimer();
      queuedSave = null;
      const snapshot = toLocalProgressSnapshot(progress, { pendingSync: false, now });
      store.save(progressStorageKey(studentId, quizId), snapshot);
      return snapshot;
    },

    queueSave({ studentId, quizId, progress, request }) {
      if (disposed) throw new Error("student-sync-client-disposed");
      const key = progressStorageKey(studentId, quizId);
      const stored = store.load(key);
      const acknowledgedRevision = Number.isSafeInteger(stored?.revision)
        && stored.revision >= 0
        ? stored.revision
        : 0;
      const controlledProgress = { ...progress, revision: acknowledgedRevision };
      const controlledRequest = { ...request, baseRevision: acknowledgedRevision };
      generation += 1;
      retryNeeded = false;
      store.save(key, toLocalProgressSnapshot(controlledProgress, { pendingSync: true, now }));
      queuedSave = {
        key,
        studentId,
        quizId,
        progress: controlledProgress,
        request: controlledRequest,
        generation,
      };
      emitSaveState("pending");
      scheduleSave();
    },

    async flush() {
      if (disposed) return null;
      clearTimer();
      retryNeeded = false;
      let result = null;
      while (activeSave || queuedSave) {
        result = await (activeSave ?? runQueuedSave());
      }
      return result;
    },

    async submit({ studentId, quizId, submission, request }) {
      if (disposed) throw new Error("student-sync-client-disposed");
      const key = pendingAttemptStorageKey(studentId, quizId);
      const safeSubmission = withoutRawIdentity(cloneSerializable(submission));
      submissionSequence += 1;
      const pendingToken = typeof createToken === "function"
        ? createToken()
        : globalThis.crypto?.randomUUID?.() ?? `${now()}-${submissionSequence}`;
      const pending = { pendingToken, submission: safeSubmission };
      store.save(key, pending);
      const result = await callSubmit(request);
      if (!disposed) {
        const current = store.load(key);
        if (
          current?.pendingToken === pendingToken
          && current?.submission?.attemptId === safeSubmission?.attemptId
        ) {
          store.remove(key);
        }
      }
      return result;
    },

    async retryPendingAttempt({ studentId, quizId, buildRequest }) {
      if (disposed) throw new Error("student-sync-client-disposed");
      const key = pendingAttemptStorageKey(studentId, quizId);
      const pending = store.load(key);
      if (!pending) return null;
      const result = await callSubmit(buildRequest(pending.submission));
      if (!disposed && store.load(key)?.pendingToken === pending.pendingToken) {
        store.remove(key);
      }
      return result;
    },

    dispose() {
      disposed = true;
      retryNeeded = false;
      clearTimer();
      queuedSave = null;
    },
  };
}

export async function recoverStudentSyncOnline({
  client,
  studentId,
  quizId,
  allowSubmitRetry,
  buildSubmissionRequest,
}) {
  await client.flush();
  const pending = client.loadPendingAttempt(studentId, quizId);
  if (pending && allowSubmitRetry) {
    await client.retryPendingAttempt({
      studentId,
      quizId,
      buildRequest: buildSubmissionRequest,
    });
  }
  return client.getReadiness(studentId, quizId);
}
