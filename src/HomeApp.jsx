import { HOME_ENTRIES } from "./entryDomain.js";

const primaryStyles =
  "bg-emerald-700 text-white shadow-lg shadow-emerald-900/10 hover:bg-emerald-800";
const secondaryStyles =
  "border border-slate-200 bg-white text-slate-900 shadow-sm hover:border-emerald-300 hover:bg-emerald-50";

export default function HomeApp() {
  return (
    <main className="min-h-screen bg-stone-50 px-4 py-10 text-slate-900 sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-3xl items-center">
        <section className="w-full" aria-labelledby="home-title">
          <header className="mb-8 sm:mb-10">
            <p className="mb-3 text-sm font-bold tracking-[0.2em] text-emerald-700">
              國中自然科
            </p>
            <h1
              id="home-title"
              className="font-serif text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl"
            >
              測驗學習平台
            </h1>
            <p className="mt-4 text-base leading-7 text-slate-600 sm:text-lg">
              請選擇您的身分，前往對應的測驗與紀錄頁面。
            </p>
          </header>

          <nav aria-label="平台入口">
            <ol className="space-y-4">
              {HOME_ENTRIES.map((entry, index) => (
                <li key={entry.id}>
                  <a
                    href={`${import.meta.env.BASE_URL}${entry.href}`}
                    className={`group block rounded-2xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300 ${entry.primary ? primaryStyles : secondaryStyles}`}
                  >
                    <span className="flex min-h-28 items-center gap-4 px-5 py-5 sm:gap-6 sm:px-7">
                      <span
                        className={`flex size-11 shrink-0 items-center justify-center rounded-full font-mono text-sm font-bold ${entry.primary ? "bg-white/15 text-white" : "bg-emerald-100 text-emerald-800"}`}
                      >
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-lg font-bold sm:text-xl">
                          {entry.title}
                        </span>
                        <span
                          className={`mt-1 block text-sm leading-6 sm:text-base ${entry.primary ? "text-emerald-50" : "text-slate-600"}`}
                        >
                          {entry.description}
                        </span>
                      </span>
                      <span
                        aria-hidden="true"
                        className={`shrink-0 text-2xl transition-transform group-hover:translate-x-1 ${entry.primary ? "text-white" : "text-emerald-700"}`}
                      >
                        →
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </section>
      </div>
    </main>
  );
}
