/* Style direction: Neo-Brutalist Pixel RPG / 像素地下城；入口只保留清楚的單一測驗路徑，讓學生直接進入戰鬥場。 */
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="dark"><TooltipProvider><Toaster /><Home /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}
