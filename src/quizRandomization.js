export function shuffleCopy(items, random = Math.random) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[target]] = [
      shuffled[target],
      shuffled[index],
    ];
  }
  return shuffled;
}

export function prepareQuiz(questions, random = Math.random) {
  if (questions.length === 0) throw new Error("empty-question-bank");

  const prepared = questions.map((question) => ({
    id: question.id,
    n: question.n,
    text: question.text,
    options: shuffleCopy(
      question.options.map((text, index) => ({
        text,
        isCorrect: index === question.correct,
      })),
      random,
    ),
  }));
  return shuffleCopy(prepared, random);
}

export function isAnswerCorrect(question, selectedIndex) {
  return question.options[selectedIndex]?.isCorrect === true;
}

export function scoreQuiz(questions, answers) {
  const wrongIds = [];
  let correctCount = 0;
  for (const question of questions) {
    if (isAnswerCorrect(question, answers[question.id])) {
      correctCount += 1;
    } else {
      wrongIds.push(question.id);
    }
  }
  return { correctCount, wrongIds };
}
