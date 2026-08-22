import { BIOLOGY_QUIZ_CONTENT } from "./biologyQuizContent.js";
import { prepareQuiz } from "../../quizRandomization.js";

const questionsById = new Map(
  BIOLOGY_QUIZ_CONTENT.questions.map((question) => [question.id, question]),
);

function invalidAttempt() {
  throw new Error("invalid-biology-attempt");
}

function invalidResult() {
  throw new Error("invalid-biology-result");
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
    const confirmed = biologyQuizAdapter.renderResult(result);
    return {
      attempt,
      reviewProgress: confirmed.reviewAvailable
        ? biologyQuizAdapter.updateReviewProgress({
          previous: submission.reviewProgress ?? {},
          attempt,
          result: confirmed,
        })
        : structuredClone(submission.reviewProgress ?? {}),
      result: confirmed,
    };
  },

  renderResult(result) {
    const hasReview = Object.hasOwn(result ?? {}, "review");
    if (
      result?.resultType !== "score"
      || !Number.isFinite(result.score)
      || result.score < 0
      || result.score > 100
      || !Number.isInteger(result.correctCount)
      || !Number.isInteger(result.wrongCount)
      || result.correctCount < 0
      || result.wrongCount < 0
      || result.correctCount + result.wrongCount !== questionsById.size
      || typeof result.reviewAvailable !== "boolean"
    ) {
      invalidResult();
    }
    if (result.reviewAvailable === false) {
      if (hasReview) invalidResult();
      return {
        resultType: "score",
        score: result.score,
        correctCount: result.correctCount,
        wrongCount: result.wrongCount,
        reviewAvailable: false,
      };
    }
    if (
      !Array.isArray(result.review)
      || result.review.length !== questionsById.size
      || result.review.some((item) => (
        item === null
        || typeof item !== "object"
        || Array.isArray(item)
        || Object.keys(item).some(
          (key) => !["questionId", "correctOptionId", "explanation"].includes(key),
        )
        || Object.keys(item).length !== 3
        || !questionsById.get(item.questionId)?.options.some(
          ({ id }) => id === item.correctOptionId,
        )
        || typeof item.explanation !== "string"
        || item.explanation.trim().length === 0
      ))
      || new Set(result.review.map((item) => item.questionId)).size !== questionsById.size
    ) {
      invalidResult();
    }
    return {
      resultType: "score",
      score: result.score,
      correctCount: result.correctCount,
      wrongCount: result.wrongCount,
      reviewAvailable: true,
      review: result.review.map((item) => ({ ...item })),
    };
  },

  updateReviewProgress({ previous, attempt, result, today = new Date() }) {
    const confirmed = biologyQuizAdapter.renderResult(result);
    if (!confirmed.reviewAvailable) return structuredClone(previous ?? {});
    const rows = biologyQuizAdapter.buildAnswerReviewDisplay({ attempt, result: confirmed });
    const wrongIds = new Set(
      rows.filter(({ isCorrect }) => !isCorrect).map(({ id }) => id),
    );
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

  buildAnswerReviewDisplay({ attempt, result }) {
    const confirmed = biologyQuizAdapter.renderResult(result);
    if (!confirmed.reviewAvailable) return [];
    if (
      !Array.isArray(attempt?.questions)
      || attempt.questions.length !== questionsById.size
      || new Set(attempt.questions.map(({ id }) => id)).size !== questionsById.size
      || attempt.answers === null
      || typeof attempt.answers !== "object"
      || Array.isArray(attempt.answers)
    ) {
      invalidAttempt();
    }
    const reviewByQuestionId = new Map(
      confirmed.review.map((item) => [item.questionId, item]),
    );
    const rows = attempt.questions.map((question, index) => {
      const review = reviewByQuestionId.get(question.id);
      if (!review || !Array.isArray(question.options)) invalidAttempt();
      const hasSelectedAnswer = Object.hasOwn(attempt.answers, question.id);
      const selectedIndex = question.options.findIndex(
        ({ id }) => id === attempt.answers[question.id],
      );
      if (hasSelectedAnswer && selectedIndex < 0) invalidAttempt();
      const correctOptionPosition = question.options.findIndex(
        ({ id }) => id === review.correctOptionId,
      );
      if (correctOptionPosition < 0) invalidAttempt();
      return {
        id: question.id,
        attemptPosition: index + 1,
        text: question.text,
        isCorrect: selectedIndex === correctOptionPosition,
        selectedAnswer: selectedIndex < 0 ? null : {
          letter: "ABCD"[selectedIndex],
          text: question.options[selectedIndex].text,
        },
        correctAnswer: {
          letter: "ABCD"[correctOptionPosition],
          text: question.options[correctOptionPosition].text,
        },
        explanation: review.explanation,
      };
    });
    const wrongCount = rows.filter(({ isCorrect }) => !isCorrect).length;
    if (wrongCount !== confirmed.wrongCount) invalidResult();
    return rows;
  },

  buildWrongAnswerDisplay({ attempt, result }) {
    return biologyQuizAdapter.buildAnswerReviewDisplay({ attempt, result })
      .filter(({ isCorrect }) => !isCorrect)
      .map(({ isCorrect: _isCorrect, explanation: _explanation, ...row }) => row);
  },
});

const REVIEW_INTERVALS = [1, 2, 4, 7, 15, 30];
const formatDate = (date) => `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};
