import { ENGLISH_REVIEW_2 } from "./englishReview2Definition.js";

function invalidSubmission() {
  throw new Error("invalid-submission");
}

export function scoreEnglishReview2(payload) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    invalidSubmission();
  }

  const { answers } = payload;
  if (answers === null || typeof answers !== "object" || Array.isArray(answers)) {
    invalidSubmission();
  }

  const questionIds = new Set(ENGLISH_REVIEW_2.questions.map((question) => question.id));
  if (Object.keys(answers).some((questionId) => !questionIds.has(questionId))) {
    invalidSubmission();
  }

  let score = 0;
  let correctCount = 0;
  const wrongIds = [];
  for (const question of ENGLISH_REVIEW_2.questions) {
    const answer = answers[question.id];
    if (answer !== undefined && !question.options.some((option) => option.id === answer)) {
      invalidSubmission();
    }
    if (question.options.some((option) => option.id === answer && option.correct)) {
      correctCount += 1;
      score += question.points;
    } else {
      wrongIds.push(question.id);
    }
  }

  return {
    resultType: "score",
    score,
    correctCount,
    wrongCount: ENGLISH_REVIEW_2.questions.length - correctCount,
    wrongIds,
  };
}
