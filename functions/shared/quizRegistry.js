import { QUIZ_DEFINITION as BIOLOGY_QUIZ } from "./biologyDefinition.js";
import { ENGLISH_REVIEW_2 } from "./englishReview2Definition.js";
import { validateMultipleChoiceSubmission } from "./multipleChoiceSubmission.js";
import { PERIODIC_TABLE_QUIZ } from "./periodicTableDefinition.js";
import { validatePeriodicSubmission } from "./periodicTableSubmission.js";

function cloneDefinition(value) {
  if (Array.isArray(value)) return value.map(cloneDefinition);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, cloneDefinition(child)]),
    );
  }
  return value;
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

const QUIZ_DEFINITIONS = deepFreeze([
  BIOLOGY_QUIZ,
  ENGLISH_REVIEW_2,
  PERIODIC_TABLE_QUIZ,
].map(cloneDefinition));

export const QUIZ_CATALOG = deepFreeze(QUIZ_DEFINITIONS.map((definition) => ({
  id: definition.id,
  version: definition.version,
  kind: definition.kind,
  subject: definition.subject,
  title: definition.title,
  catalogDescription: definition.catalogDescription,
})));

const QUIZ_BY_ID = new Map(QUIZ_DEFINITIONS.map((definition) => [
  definition.id,
  new Map([[definition.version, definition]]),
]));

const COMMON_SUBMISSION_FIELDS = [
  "studentCode",
  "studentName",
  "studentId",
  "attemptId",
  "quizId",
  "quizVersion",
  "title",
  "subject",
  "kind",
];
const MULTIPLE_CHOICE_FIELDS = new Set([
  ...COMMON_SUBMISSION_FIELDS,
  "questionOrder",
  "optionOrder",
  "answers",
  "reviewProgress",
  "score",
]);
const PLACEMENT_FIELDS = new Set([
  ...COMMON_SUBMISSION_FIELDS,
  "placements",
  "errorCount",
  "durationSeconds",
]);

function invalidSubmission() {
  throw new Error("invalid-submission");
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value, allowedFields) {
  return isRecord(value) && Object.keys(value).every((key) => allowedFields.has(key));
}

export function getQuizDefinition(quizId, version) {
  return QUIZ_BY_ID.get(quizId)?.get(version) ?? null;
}

export function validateQuizSubmission(definition, input) {
  if (definition?.kind === "multiple-choice") {
    if (!hasOnlyKeys(input, MULTIPLE_CHOICE_FIELDS)) invalidSubmission();
    return validateMultipleChoiceSubmission(definition, input);
  }
  if (definition?.kind === "placement") {
    if (!hasOnlyKeys(input, PLACEMENT_FIELDS)) invalidSubmission();
    return validatePeriodicSubmission(definition, {
      placements: input.placements,
      errorCount: input.errorCount,
      durationSeconds: input.durationSeconds,
    });
  }
  invalidSubmission();
}
