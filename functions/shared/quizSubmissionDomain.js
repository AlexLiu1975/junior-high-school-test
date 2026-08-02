import { getQuizDefinition } from "./quizDefinition.js";

function invalidSubmission() {
  throw new Error("invalid-submission");
}

function hasExactMembers(value, expectedIds) {
  if (!Array.isArray(value) || value.length !== expectedIds.length) return false;
  const actualIds = new Set(value);
  return actualIds.size === expectedIds.length
    && expectedIds.every((expectedId) => actualIds.has(expectedId));
}

function hasExactKeys(value, expectedIds) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && hasExactMembers(Object.keys(value), expectedIds);
}

export function validateAndScoreSubmission({
  quizId,
  quizVersion,
  questionOrder,
  optionOrder,
  answers,
} = {}) {
  const definition = getQuizDefinition(quizId, quizVersion);
  if (!definition) invalidSubmission();

  const questionIds = definition.questions.map(({ id }) => id);
  if (!hasExactMembers(questionOrder, questionIds)
    || !hasExactKeys(optionOrder, questionIds)
    || !hasExactKeys(answers, questionIds)) {
    invalidSubmission();
  }

  let correctCount = 0;
  const wrongIds = [];
  for (const question of definition.questions) {
    const optionIds = question.options.map(({ id }) => id);
    const answer = answers[question.id];
    if (!hasExactMembers(optionOrder[question.id], optionIds)
      || typeof answer !== "string"
      || !optionIds.includes(answer)) {
      invalidSubmission();
    }

    if (question.options.find(({ id }) => id === answer)?.correct) {
      correctCount += 1;
    } else {
      wrongIds.push(question.id);
    }
  }

  return {
    correctCount,
    wrongCount: definition.questions.length - correctCount,
    score: (correctCount / definition.questions.length) * 100,
    wrongIds,
  };
}
