import { useLayoutEffect, useState } from 'react'
import BoardCanvas from './BoardCanvas'
import ThemeToggle from './components/ThemeToggle'
import { applyTheme, getInitialTheme, type Theme } from './theme'

export default function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useLayoutEffect(() => {
    applyTheme(theme)
  }, [theme])

  return (
    <div className="app-shell">
      <BoardCanvas theme={theme} />
      <ThemeToggle theme={theme} onToggle={() => setTheme(theme === 'light' ? 'dark' : 'light')} />
    </div>
  )
}
