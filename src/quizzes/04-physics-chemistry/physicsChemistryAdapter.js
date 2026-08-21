import { prepareQuiz } from "../../quizRandomization.js";

// Shared adapter factory for the two physics-chemistry papers. Both are
// single-page multiple-choice quizzes with permutation ordering (questions and
// options are shuffled per attempt) and a full post-submission review (every
// question's correct answer and explanation). No spaced-repetition review
// scheduling, so reviewProgress is always empty.
export function createPhysicsChemistryAdapter(content) {
  const questionsById = new Map(content.questions.map((question) => [question.id, question]));
  const size = questionsById.size;

  function invalidAttempt() {
    throw new Error("invalid-physics-chemistry-attempt");
  }
  function invalidResult() {
    throw new Error("invalid-physics-chemistry-result");
  }
  function cloneAnswers(answers) {
    return Object.fromEntries(Object.entries(answers ?? {}));
  }

  function restoreQuestions(questionOrder, optionOrder) {
    if (
      !Array.isArray(questionOrder)
      || questionOrder.length !== size
      || new Set(questionOrder).size !== size
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
      return {
        id: source.id,
        n: source.n,
        text: source.text,
        figureIds: Array.isArray(source.figureIds) ? [...source.figureIds] : [],
        options,
      };
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
      currentQuestionIndex: state.currentQuestionIndex ?? 0,
    };
  }

  const adapter = Object.freeze({
    createAttempt({ random = Math.random, attemptId = crypto.randomUUID() } = {}) {
      const ordered = content.orderingPolicy === "permutation"
        ? prepareQuiz(content.questions, random)
        : content.questions.map((question) => ({
          id: question.id,
          n: question.n,
          text: question.text,
          options: question.options.map(({ id, text }) => ({ id, text })),
        }));
      const questions = ordered.map((question) => ({
        ...question,
        figureIds: Array.isArray(questionsById.get(question.id)?.figureIds)
          ? [...questionsById.get(question.id).figureIds]
          : [],
      }));
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
        || saved.answers === null
        || typeof saved.answers !== "object"
        || Array.isArray(saved.answers)
      ) {
        invalidAttempt();
      }
      const currentQuestionIndex = Number.isInteger(saved.currentQuestionIndex)
        ? saved.currentQuestionIndex
        : 0;
      if (currentQuestionIndex < 0 || currentQuestionIndex >= size) invalidAttempt();
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
        currentQuestionIndex,
        reviewProgress: {},
      };
    },

    serializeProgress(state) {
      return { activeAttempt: progressFields(state), reviewProgress: {} };
    },

    buildSubmission(state) {
      const { currentQuestionIndex: _drop, ...submission } = progressFields(state);
      return { ...submission, reviewProgress: {} };
    },

    getUnansweredCount(answers) {
      return size - Object.keys(cloneAnswers(answers)).length;
    },

    renderResult(result) {
      if (
        result?.resultType !== "score"
        || !Number.isFinite(result.score)
        || result.score < 0
        || result.score > 100
        || !Number.isInteger(result.correctCount)
        || !Number.isInteger(result.wrongCount)
        || result.correctCount < 0
        || result.wrongCount < 0
        || result.correctCount + result.wrongCount !== size
        || result.reviewAvailable !== true
        || !Array.isArray(result.review)
        || result.review.length !== size
        || result.review.some((item) => (
          item === null
          || typeof item !== "object"
          || Array.isArray(item)
          || Object.keys(item).some((key) => !["questionId", "correctOptionId", "explanation"].includes(key))
          || Object.keys(item).length !== 3
          || !questionsById.get(item.questionId)?.options.some(({ id }) => id === item.correctOptionId)
          || typeof item.explanation !== "string"
          || item.explanation.trim().length === 0
        ))
        || new Set(result.review.map((item) => item.questionId)).size !== size
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

    buildAnswerReviewDisplay({ attempt, result }) {
      const confirmed = adapter.renderResult(result);
      if (
        !Array.isArray(attempt?.questions)
        || attempt.questions.length !== size
        || new Set(attempt.questions.map(({ id }) => id)).size !== size
        || attempt.answers === null
        || typeof attempt.answers !== "object"
        || Array.isArray(attempt.answers)
      ) {
        invalidAttempt();
      }
      const reviewByQuestionId = new Map(confirmed.review.map((item) => [item.questionId, item]));
      const rows = attempt.questions.map((question, index) => {
        const review = reviewByQuestionId.get(question.id);
        if (!review || !Array.isArray(question.options)) invalidAttempt();
        const hasSelected = Object.hasOwn(attempt.answers, question.id);
        const selectedIndex = question.options.findIndex(({ id }) => id === attempt.answers[question.id]);
        if (hasSelected && selectedIndex < 0) invalidAttempt();
        const correctIndex = question.options.findIndex(({ id }) => id === review.correctOptionId);
        if (correctIndex < 0) invalidAttempt();
        return {
          id: question.id,
          n: question.n,
          attemptPosition: index + 1,
          text: question.text,
          figureIds: Array.isArray(question.figureIds) ? [...question.figureIds] : [],
          options: question.options.map((option, optionIndex) => ({
            id: option.id,
            letter: "ABCD"[optionIndex],
            text: option.text,
            isCorrect: option.id === review.correctOptionId,
            isSelected: selectedIndex === optionIndex,
          })),
          isCorrect: selectedIndex === correctIndex,
          selectedAnswer: selectedIndex < 0 ? null : {
            letter: "ABCD"[selectedIndex],
            text: question.options[selectedIndex].text,
          },
          correctAnswer: {
            letter: "ABCD"[correctIndex],
            text: question.options[correctIndex].text,
          },
          explanation: review.explanation,
        };
      });
      if (rows.filter(({ isCorrect }) => !isCorrect).length !== confirmed.wrongCount) invalidResult();
      return rows;
    },

    restoreConfirmedSubmission({ currentAttempt, submission, result }) {
      if (submission?.attemptId !== currentAttempt?.attemptId) invalidAttempt();
      const attempt = adapter.restoreAttempt({
        attemptId: submission.attemptId,
        questionOrder: submission.questionOrder,
        optionOrder: submission.optionOrder,
        answers: submission.answers,
        currentQuestionIndex: currentAttempt.currentQuestionIndex ?? 0,
      });
      return { attempt, result: adapter.renderResult(result) };
    },
  });

  return adapter;
}
