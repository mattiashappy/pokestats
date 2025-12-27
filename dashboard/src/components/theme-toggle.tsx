import { Moon, Sun } from 'lucide-react'

import { Button } from './ui/button'
import { useTheme } from '../providers/theme'

export function ThemeToggle(): JSX.Element {
  const { theme, toggleTheme } = useTheme()

  return (
    <Button variant="ghost" size="sm" onClick={toggleTheme} aria-label="Toggle theme">
      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  )
}
