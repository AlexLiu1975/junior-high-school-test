import { QUIZ_DEFINITION as BIOLOGY_QUIZ } from "./biologyDefinition.js";
import { ENGLISH_REVIEW_2 } from "./englishReview2Definition.js";
import { validateMultipleChoiceSubmission } from "./multipleChoiceSubmission.js";
import { PERIODIC_TABLE_QUIZ } from "./periodicTableDefinition.js";
import { validatePeriodicSubmission } from "./periodicTableSubmission.js";

const QUIZ_DEFINITIONS = [
  BIOLOGY_QUIZ,
  ENGLISH_REVIEW_2,
  PERIODIC_TABLE_QUIZ,
];

export const QUIZ_CATALOG = Object.freeze(QUIZ_DEFINITIONS.map((definition) => Object.freeze({
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
    return validatePeriodicSubmission({
      placements: input.placements,
      errorCount: input.errorCount,
      durationSeconds: input.durationSeconds,
    });
  }
  invalidSubmission();
}
