import { QUIZ_DEFINITION } from "../functions/shared/biologyDefinition.js";
import { prepareQuiz } from "./quizRandomization.js";

const questionsById = new Map(
  QUIZ_DEFINITION.questions.map((question) => [question.id, question]),
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
      return { id: option.id, text: option.text, isCorrect: option.correct === true };
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
    const questions = prepareQuiz(QUIZ_DEFINITION.questions, random);
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

  renderResult(result) {
    if (
      result?.resultType !== "score"
      || !Number.isFinite(result.score)
      || !Number.isInteger(result.correctCount)
      || !Number.isInteger(result.wrongCount)
    ) {
      throw new Error("invalid-biology-result");
    }
    return {
      score: result.score,
      correctCount: result.correctCount,
      wrongCount: result.wrongCount,
    };
  },
});
