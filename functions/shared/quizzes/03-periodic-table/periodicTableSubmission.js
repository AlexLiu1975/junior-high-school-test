const MAX_ERROR_COUNT = 100000;
const MAX_DURATION_SECONDS = 604800;
const SUBMISSION_FIELDS = new Set(["placements", "errorCount", "durationSeconds"]);

function invalidSubmission() {
  throw new Error("invalid-submission");
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}

function isBoundedInteger(value, max) {
  return Number.isInteger(value) && value >= 0 && value <= max;
}

export function validatePeriodicSubmission(definition, input) {
  if (!isPlainObject(definition) || !Array.isArray(definition.elements)
    || !isPlainObject(input) || !isPlainObject(input.placements)) invalidSubmission();
  if (Object.keys(input).length !== SUBMISSION_FIELDS.size || Object.keys(input).some((key) => !SUBMISSION_FIELDS.has(key))) {
    invalidSubmission();
  }
  if (!isBoundedInteger(input.errorCount, MAX_ERROR_COUNT)) invalidSubmission();
  if (!isBoundedInteger(input.durationSeconds, MAX_DURATION_SECONDS)) invalidSubmission();

  const { elements } = definition;
  if (elements.length === 0
    || elements.some(({ id, targetId }) => typeof id !== "string" || typeof targetId !== "string")
    || new Set(elements.map(({ id }) => id)).size !== elements.length
    || new Set(elements.map(({ targetId }) => targetId)).size !== elements.length) invalidSubmission();
  const expectedElementIds = new Set(elements.map((element) => element.id));
  const placementEntries = Object.entries(input.placements);
  if (placementEntries.length !== elements.length) invalidSubmission();
  if (placementEntries.some(([elementId, targetId]) => !expectedElementIds.has(elementId) || typeof targetId !== "string")) {
    invalidSubmission();
  }

  const placedTargets = new Set(placementEntries.map(([, targetId]) => targetId));
  if (placedTargets.size !== elements.length) invalidSubmission();
  if (elements.some((element) => input.placements[element.id] !== element.targetId)) invalidSubmission();

  return {
    resultType: "placement",
    completedCount: elements.length,
    totalItems: elements.length,
    errorCount: input.errorCount,
    durationSeconds: input.durationSeconds,
    completed: true,
  };
}
