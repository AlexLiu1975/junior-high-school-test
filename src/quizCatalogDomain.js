import { QUIZ_CATALOG } from "../functions/shared/quizRegistry.js";

const QUIZZES_BY_ID = new Map(QUIZ_CATALOG.map((quiz) => [quiz.id, quiz]));

export { QUIZ_CATALOG };

export function resolveQuizRoute(search) {
  const params = new URLSearchParams(String(search ?? ""));
  const quizIds = params.getAll("quiz");
  if (quizIds.length === 0) return { mode: "catalog" };
  if (quizIds.length !== 1) return { mode: "not-found" };

  const quizId = quizIds[0];
  const quiz = QUIZZES_BY_ID.get(quizId);
  return quiz
    ? { mode: "quiz", quizId, quiz }
    : { mode: "not-found" };
}

export function catalogQuizUrl(quizId, baseUrl = "/") {
  if (!QUIZZES_BY_ID.has(quizId)) throw new Error("unknown-quiz-id");
  const normalizedBase = String(baseUrl).endsWith("/")
    ? String(baseUrl)
    : `${baseUrl}/`;
  return `${normalizedBase}quiz.html?quiz=${encodeURIComponent(quizId)}`;
}
