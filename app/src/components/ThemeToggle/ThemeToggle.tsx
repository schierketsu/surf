import type { Theme } from '../../theme'
import sunIcon from './icons/sun.png'
import moonIcon from './icons/moon.png'
import './ThemeToggle.css'

type ThemeToggleProps = {
  theme: Theme
  onToggle: () => void
}

export default function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  const isDark = theme === 'dark'

  return (
    <button
      className={`theme-toggle${isDark ? ' theme-toggle--dark' : ''}`}
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label="Тёмная тема"
      title={isDark ? 'Включить светлую тему' : 'Включить тёмную тему'}
      onClick={onToggle}
    >
      <img className="theme-toggle__icon theme-toggle__icon--sun" src={sunIcon} alt="" aria-hidden="true" />
      <img className="theme-toggle__icon theme-toggle__icon--moon" src={moonIcon} alt="" aria-hidden="true" />
    </button>
  )
}
