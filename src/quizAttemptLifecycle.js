import { prepareQuiz, scoreQuiz } from "./quizRandomization.js";

const LETTERS = ["A", "B", "C", "D"];

export const EMPTY_QUIZ_MESSAGE = "目前沒有可用的題目。";

export function createQuizAttemptLifecycle() {
  let activeOperation = null;
  let questions = [];

  const claim = (operation) => {
    if (activeOperation !== null) return false;
    activeOperation = operation;
    return true;
  };

  const release = (operation) => {
    if (activeOperation === operation) activeOperation = null;
  };

  return {
    claimStart: () => claim("start"),
    releaseStart: () => release("start"),
    claimFinish: () => claim("finish"),
    releaseFinish: () => release("finish"),
    claimClear: () => claim("clear"),
    releaseClear: () => release("clear"),

    prepareAttempt(sourceQuestions, random = Math.random) {
      try {
        questions = prepareQuiz(sourceQuestions, random);
        return { ok: true, questions };
      } catch (error) {
        if (error instanceof Error && error.message === "empty-question-bank") {
          return { ok: false, error: EMPTY_QUIZ_MESSAGE };
        }
        throw error;
      }
    },

    move(current, offset) {
      if (questions.length === 0) return 0;
      return Math.max(0, Math.min(current + offset, questions.length - 1));
    },

    questionAt(index) {
      return questions[index];
    },

    resultsFor(answers) {
      const { correctCount, wrongIds } = scoreQuiz(questions, answers);
      const wrongAnswers = questions
        .map((question, index) => ({ question, index }))
        .filter(({ question }) => wrongIds.includes(question.id))
        .map(({ question, index }) => {
          const selectedIndex = answers[question.id];
          const selectedOption = question.options[selectedIndex];
          const correctIndex = question.options.findIndex(
            ({ isCorrect }) => isCorrect,
          );

          return {
            id: question.id,
            attemptPosition: index + 1,
            text: question.text,
            selectedAnswer: selectedOption
              ? { letter: LETTERS[selectedIndex], text: selectedOption.text }
              : null,
            correctAnswer: {
              letter: LETTERS[correctIndex],
              text: question.options[correctIndex].text,
            },
          };
        });

      return { correctCount, wrongIds, wrongAnswers };
    },
  };
}
