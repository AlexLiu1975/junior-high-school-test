import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { QuizNavigation } from './QuizCatalog.jsx'
import { resolveQuizRoute } from './quizCatalogDomain.js'
import StudentQuizShell from './StudentQuizShell.jsx'

const route = resolveQuizRoute(window.location.search)
const moduleLoader = route.mode === 'quiz'
  ? {
      'biology-cell-microscope-1': () => import('./quizzes/01-biology/BiologyQuiz.jsx'),
      'english-review-2': () => import('./quizzes/02-english/EnglishReview2Quiz.jsx'),
      'periodic-table': () => import('./quizzes/03-periodic-table/PeriodicTableQuiz.jsx'),
    }[route.quiz.id] ?? null
  : null
const quizEntry = route.mode === 'catalog'
  ? <QuizNavigation />
  : route.mode === 'not-found'
    ? <QuizNavigation notFound />
    : <StudentQuizShell quiz={route.quiz} moduleLoader={moduleLoader} />

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {quizEntry}
  </StrictMode>,
)
