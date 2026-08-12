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
      question.options.map(({ id, text }) => ({
        id,
        text,
      })),
      random,
    ),
  }));
  return shuffleCopy(prepared, random);
}
