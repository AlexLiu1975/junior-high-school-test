function invalidSubmission() {
  throw new Error("invalid-submission");
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactMembers(value, expectedIds) {
  if (!Array.isArray(value) || value.length !== expectedIds.length) return false;
  const actualIds = new Set(value);
  return actualIds.size === expectedIds.length
    && expectedIds.every((expectedId) => actualIds.has(expectedId));
}

function hasExactKeys(value, expectedIds) {
  return isRecord(value)
    && hasExactMembers(Object.keys(value), expectedIds);
}

function validateSubmittedOrder(definition, input) {
  const hasQuestionOrder = Object.hasOwn(input, "questionOrder");
  const hasOptionOrder = Object.hasOwn(input, "optionOrder");
  if (hasQuestionOrder !== hasOptionOrder) invalidSubmission();
  if (!hasQuestionOrder) return;

  const questionIds = definition.questions.map(({ id }) => id);
  if (!hasExactMembers(input.questionOrder, questionIds)
    || !hasExactKeys(input.optionOrder, questionIds)) {
    invalidSubmission();
  }
  for (const question of definition.questions) {
    const optionIds = question.options.map(({ id }) => id);
    if (!hasExactMembers(input.optionOrder[question.id], optionIds)) {
      invalidSubmission();
    }
  }
}

export function validateMultipleChoiceSubmission(definition, input) {
  if (!isRecord(definition) || !Array.isArray(definition.questions) || !isRecord(input)) {
    invalidSubmission();
  }
  if (!isRecord(input.answers)) invalidSubmission();

  validateSubmittedOrder(definition, input);
  const questionIds = new Set(definition.questions.map(({ id }) => id));
  if (questionIds.size === 0
    || Object.keys(input.answers).some((questionId) => !questionIds.has(questionId))) {
    invalidSubmission();
  }

  let earnedPoints = 0;
  let correctCount = 0;
  let totalPoints = 0;
  const wrongIds = [];
  for (const question of definition.questions) {
    if (typeof question.id !== "string" || !Array.isArray(question.options)) {
      invalidSubmission();
    }
    const points = question.points ?? 1;
    if (!Number.isFinite(points) || points <= 0) invalidSubmission();
    totalPoints += points;

    const answer = input.answers[question.id];
    if (answer !== undefined
      && (typeof answer !== "string"
        || !question.options.some(({ id }) => id === answer))) {
      invalidSubmission();
    }
    if (question.options.some(({ id, correct }) => id === answer && correct)) {
      correctCount += 1;
      earnedPoints += points;
    } else {
      wrongIds.push(question.id);
    }
  }
  if (totalPoints <= 0) invalidSubmission();

  return {
    resultType: "score",
    score: (earnedPoints / totalPoints) * 100,
    correctCount,
    wrongCount: definition.questions.length - correctCount,
    wrongIds,
  };
}
