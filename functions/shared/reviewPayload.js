function invalidTrustedResult() {
  throw new Error("invalid-trusted-result");
}

export function buildReviewPayload(definition, wrongIds) {
  if (definition?.kind !== "multiple-choice" || !Array.isArray(wrongIds)) {
    invalidTrustedResult();
  }
  const questions = new Map(definition.questions.map((question) => [question.id, question]));
  return wrongIds.map((questionId) => {
    const question = questions.get(questionId);
    const correct = question?.options.find((option) => option.correct === true);
    if (!question || !correct) invalidTrustedResult();
    return {
      questionId,
      correctOptionId: correct.id,
      ...(typeof question.explanation === "string" && question.explanation.length > 0
        ? { explanation: question.explanation }
        : {}),
    };
  });
}
