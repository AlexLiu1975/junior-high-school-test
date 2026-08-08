import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { QuizNavigation } from './QuizCatalog.jsx'
import { resolveQuizRoute } from './quizCatalogDomain.js'
import StudentQuizShell from './StudentQuizShell.jsx'

const route = resolveQuizRoute(window.location.search)
const quizEntry = route.mode === 'catalog'
  ? <QuizNavigation />
  : route.mode === 'not-found'
    ? <QuizNavigation notFound />
    : <StudentQuizShell quiz={route.quiz} />

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {quizEntry}
  </StrictMode>,
)
