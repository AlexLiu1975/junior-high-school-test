import HomeLink from "./HomeLink.jsx";
import {
  catalogQuizUrl,
  QUIZ_CATALOG,
} from "./quizCatalogDomain.js";

const SUBJECT_LABELS = {
  Biology: "生物",
  English: "英語",
  Science: "化學",
};

export function QuizNavigation({ notFound = false }) {
  const baseUrl = import.meta.env.BASE_URL;
  return (
    <main className="min-h-screen bg-[#f3f0e8] px-4 py-8 text-slate-900 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <HomeLink className="mb-6" variant="teacher" />
        {notFound && (
          <section role="alert" className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-5">
            <h1 className="text-xl font-bold text-red-900">找不到這份試卷</h1>
            <p className="mt-2 text-sm text-red-800">
              試卷網址可能有誤，請從下方選單重新選擇。
            </p>
            <a
              href={`${baseUrl}quiz.html`}
              className="mt-4 inline-flex rounded-lg bg-red-800 px-4 py-2 text-sm font-bold text-white"
            >
              返回試卷選單
            </a>
          </section>
        )}
        <header className="mb-6">
          <p className="text-sm font-bold tracking-[0.2em] text-emerald-800">STUDENT QUIZZES</p>
          <h1 className="mt-2 font-serif text-3xl font-bold">學生試卷選單</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            選擇試卷後，再輸入學生專屬代碼與姓名。選單本身不會讀取學生資料。
          </p>
        </header>
        <div className="space-y-3">
          {QUIZ_CATALOG.map((quiz, index) => (
            <a
              key={quiz.id}
              href={catalogQuizUrl(quiz.id, baseUrl)}
              className="group flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-500 hover:shadow-md"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-900 font-mono text-sm font-bold text-white">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-bold tracking-[0.18em] text-emerald-800">
                  {SUBJECT_LABELS[quiz.subject] ?? quiz.subject}
                </span>
                <strong className="mt-1 block font-serif text-lg text-slate-950">
                  {quiz.title}
                </strong>
                <span className="mt-1 block text-sm leading-6 text-slate-600">
                  {quiz.catalogDescription}
                </span>
              </span>
              <span aria-hidden="true" className="text-2xl text-emerald-800 transition group-hover:translate-x-1">
                →
              </span>
            </a>
          ))}
        </div>
      </div>
    </main>
  );
}

export default function QuizCatalog() {
  return <QuizNavigation />;
}
