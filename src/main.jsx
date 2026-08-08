import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { QuizNavigation } from './QuizCatalog.jsx'
import { resolveQuizRoute } from './quizCatalogDomain.js'
import StudentQuizShell from './StudentQuizShell.jsx'

const route = resolveQuizRoute(window.location.search)
const moduleLoader = route.mode === 'quiz' && route.quiz.id === 'biology-cell-microscope-1'
  ? () => import('./BiologyQuiz.jsx')
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
