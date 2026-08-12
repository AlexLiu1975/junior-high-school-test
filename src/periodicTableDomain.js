const MAX_ERROR_COUNT = 100000;

function assertElements(elements) {
  if (!Array.isArray(elements) || elements.length === 0) throw new Error("invalid-elements");
  if (new Set(elements.map((element) => element.id)).size !== elements.length) throw new Error("invalid-elements");
  if (new Set(elements.map((element) => element.targetId)).size !== elements.length) throw new Error("invalid-elements");
}

function assertTimestamp(nowMs) {
  if (!Number.isFinite(nowMs)) throw new Error("invalid-timestamp");
}

function boundedRandomIndex(random, length) {
  const value = random();
  if (!Number.isFinite(value)) throw new Error("invalid-random");
  return Math.min(length - 1, Math.max(0, Math.floor(value * length)));
}

export function shufflePeriodicElements(elements, random = Math.random) {
  const shuffled = [...elements];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = boundedRandomIndex(random, index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

export function createPeriodicAttempt(elements, random = Math.random, nowMs = 0) {
  assertElements(elements);
  assertTimestamp(nowMs);

  return {
    elements: [...elements],
    pool: shufflePeriodicElements(elements, random),
    placements: {},
    errorCount: 0,
    lastAttempt: null,
    timerState: "running",
    elapsedMs: 0,
    segmentStartedAtMs: nowMs,
  };
}

export function placeElement(state, elementId, targetId) {
  const element = state.elements.find((candidate) => candidate.id === elementId);
  const hasLegalTarget = state.elements.some((candidate) => candidate.targetId === targetId);
  if (!element || !hasLegalTarget || state.placements[elementId]) return state;
  if (Object.values(state.placements).includes(targetId)) return state;

  const correct = element.targetId === targetId;
  const lastAttempt = { elementId, targetId, correct };
  if (!correct) {
    return {
      ...state,
      errorCount: Math.min(MAX_ERROR_COUNT, state.errorCount + 1),
      lastAttempt,
    };
  }

  return {
    ...state,
    pool: state.pool.filter((candidate) => candidate.id !== elementId),
    placements: { ...state.placements, [elementId]: targetId },
    lastAttempt,
  };
}

export function pauseTimer(state, nowMs) {
  assertTimestamp(nowMs);
  if (state.timerState !== "running") return state;

  return {
    ...state,
    timerState: "paused",
    elapsedMs: state.elapsedMs + Math.max(0, nowMs - state.segmentStartedAtMs),
    segmentStartedAtMs: null,
  };
}

export function resumeTimer(state, nowMs) {
  assertTimestamp(nowMs);
  if (state.timerState !== "paused") return state;

  return {
    ...state,
    timerState: "running",
    segmentStartedAtMs: nowMs,
  };
}
