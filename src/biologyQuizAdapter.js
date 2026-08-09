import { BIOLOGY_QUIZ_CONTENT } from "./biologyQuizContent.js";
import { prepareQuiz } from "./quizRandomization.js";

const questionsById = new Map(
  BIOLOGY_QUIZ_CONTENT.questions.map((question) => [question.id, question]),
);

function invalidAttempt() {
  throw new Error("invalid-biology-attempt");
}

function cloneAnswers(answers) {
  return Object.fromEntries(Object.entries(answers ?? {}));
}

function restoreQuestions(questionOrder, optionOrder) {
  if (
    !Array.isArray(questionOrder)
    || questionOrder.length !== questionsById.size
    || new Set(questionOrder).size !== questionsById.size
  ) {
    invalidAttempt();
  }

  return questionOrder.map((questionId) => {
    const source = questionsById.get(questionId);
    const orderedOptionIds = optionOrder?.[questionId];
    if (!source || !Array.isArray(orderedOptionIds)) invalidAttempt();
    const optionsById = new Map(source.options.map((option) => [option.id, option]));
    if (
      orderedOptionIds.length !== optionsById.size
      || new Set(orderedOptionIds).size !== optionsById.size
    ) {
      invalidAttempt();
    }
    const options = orderedOptionIds.map((optionId) => {
      const option = optionsById.get(optionId);
      if (!option) invalidAttempt();
      return { id: option.id, text: option.text };
    });
    return { id: source.id, n: source.n, text: source.text, options };
  });
}

function progressFields(state) {
  return {
    attemptId: state.attemptId,
    questionOrder: [...state.questionOrder],
    optionOrder: Object.fromEntries(
      state.questionOrder.map((questionId) => [questionId, [...state.optionOrder[questionId]]]),
    ),
    answers: cloneAnswers(state.answers),
    currentQuestionIndex: state.currentQuestionIndex,
  };
}

export const biologyQuizAdapter = Object.freeze({
  createAttempt({ random = Math.random, attemptId = crypto.randomUUID() } = {}) {
    const questions = prepareQuiz(BIOLOGY_QUIZ_CONTENT.questions, random);
    return {
      attemptId,
      questions,
      questionOrder: questions.map(({ id }) => id),
      optionOrder: Object.fromEntries(
        questions.map((question) => [question.id, question.options.map(({ id }) => id)]),
      ),
      answers: {},
      currentQuestionIndex: 0,
      reviewProgress: {},
    };
  },

  restoreAttempt(saved) {
    if (
      saved === null
      || typeof saved !== "object"
      || typeof saved.attemptId !== "string"
      || saved.attemptId.length === 0
      || !Array.isArray(saved.questionOrder)
      || saved.optionOrder === null
      || typeof saved.optionOrder !== "object"
      || Array.isArray(saved.optionOrder)
      || saved.questionOrder.some((questionId) => !Array.isArray(saved.optionOrder[questionId]))
      || !Number.isInteger(saved.currentQuestionIndex)
      || saved.currentQuestionIndex < 0
      || saved.currentQuestionIndex >= questionsById.size
      || saved.answers === null
      || typeof saved.answers !== "object"
      || Array.isArray(saved.answers)
    ) {
      invalidAttempt();
    }
    const questionOrder = [...saved.questionOrder];
    const optionOrder = Object.fromEntries(
      questionOrder.map((questionId) => [questionId, [...(saved.optionOrder?.[questionId] ?? [])]]),
    );
    const questions = restoreQuestions(questionOrder, optionOrder);
    const validOptionIds = new Map(
      questions.map((question) => [question.id, new Set(question.options.map(({ id }) => id))]),
    );
    for (const [questionId, optionId] of Object.entries(saved.answers)) {
      if (!validOptionIds.get(questionId)?.has(optionId)) invalidAttempt();
    }
    return {
      attemptId: saved.attemptId,
      questions,
      questionOrder,
      optionOrder,
      answers: cloneAnswers(saved.answers),
      currentQuestionIndex: saved.currentQuestionIndex,
      reviewProgress: {},
    };
  },

  serializeProgress(state) {
    return {
      activeAttempt: progressFields(state),
      reviewProgress: structuredClone(state.reviewProgress ?? {}),
    };
  },

  buildSubmission(state) {
    const progress = progressFields(state);
    const { currentQuestionIndex: _currentQuestionIndex, ...submission } = progress;
    return {
      ...submission,
      reviewProgress: structuredClone(state.reviewProgress ?? {}),
    };
  },

  restoreConfirmedSubmission({ currentAttempt, submission, result }) {
    if (submission?.attemptId !== currentAttempt?.attemptId) invalidAttempt();
    const attempt = biologyQuizAdapter.restoreAttempt({
      attemptId: submission.attemptId,
      questionOrder: submission.questionOrder,
      optionOrder: submission.optionOrder,
      answers: submission.answers,
      currentQuestionIndex: currentAttempt.currentQuestionIndex,
    });
    return {
      attempt,
      reviewProgress: biologyQuizAdapter.updateReviewProgress({
        previous: submission.reviewProgress ?? {},
        result,
      }),
      result: biologyQuizAdapter.renderResult(result),
    };
  },

  renderResult(result) {
    if (
      result?.resultType !== "score"
      || !Number.isFinite(result.score)
      || !Number.isInteger(result.correctCount)
      || !Number.isInteger(result.wrongCount)
      || !Array.isArray(result.review)
      || result.review.length !== result.wrongCount
      || result.review.some((item) => (
        item === null
        || typeof item !== "object"
        || Object.keys(item).some((key) => !["questionId", "correctOptionId"].includes(key))
        || !questionsById.get(item.questionId)?.options.some(({ id }) => id === item.correctOptionId)
      ))
      || new Set(result.review.map((item) => item.questionId)).size !== result.review.length
    ) {
      throw new Error("invalid-biology-result");
    }
    return {
      score: result.score,
      correctCount: result.correctCount,
      wrongCount: result.wrongCount,
      review: result.review.map((item) => ({ ...item })),
    };
  },

  updateReviewProgress({ previous, result, today = new Date() }) {
    const confirmed = biologyQuizAdapter.renderResult(result);
    const wrongIds = new Set(confirmed.review.map(({ questionId }) => questionId));
    const next = structuredClone(previous ?? {});
    for (const questionId of questionsById.keys()) {
      const prior = next[questionId] ?? { errorCount: 0, stage: -1 };
      if (wrongIds.has(questionId)) {
        next[questionId] = {
          errorCount: prior.errorCount + 1,
          stage: 0,
          lastResult: "wrong",
          lastAttempt: formatDate(today),
          nextReview: formatDate(addDays(today, 1)),
        };
      } else {
        const stage = Math.min(prior.stage + 1, REVIEW_INTERVALS.length - 1);
        next[questionId] = {
          errorCount: prior.errorCount,
          stage,
          lastResult: "correct",
          lastAttempt: formatDate(today),
          nextReview: formatDate(addDays(today, REVIEW_INTERVALS[stage])),
        };
      }
    }
    return next;
  },

  buildWrongAnswerDisplay({ attempt, result }) {
    const confirmed = biologyQuizAdapter.renderResult(result);
    return confirmed.review.map(({ questionId, correctOptionId }) => {
      const question = attempt.questions.find(({ id }) => id === questionId);
      if (!question) invalidAttempt();
      const selectedIndex = question.options.findIndex(({ id }) => id === attempt.answers[questionId]);
      const correctOptionPosition = question.options.findIndex(({ id }) => id === correctOptionId);
      if (correctOptionPosition < 0) invalidAttempt();
      return {
        id: questionId,
        attemptPosition: attempt.questions.findIndex(({ id }) => id === questionId) + 1,
        text: question.text,
        selectedAnswer: selectedIndex < 0 ? null : {
          letter: "ABCD"[selectedIndex],
          text: question.options[selectedIndex].text,
        },
        correctAnswer: {
          letter: "ABCD"[correctOptionPosition],
          text: question.options[correctOptionPosition].text,
        },
      };
    });
  },
});

const REVIEW_INTERVALS = [1, 2, 4, 7, 15, 30];
const formatDate = (date) => `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};
