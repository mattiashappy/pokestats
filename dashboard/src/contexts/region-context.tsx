import { createContext, useContext, useEffect, useMemo, useState } from 'react'

export type Language = 'english' | 'japanese'

type RegionContextValue = {
  language: Language
  setLanguage: (language: Language) => void
}

const RegionContext = createContext<RegionContextValue | null>(null)
const STORAGE_KEY = 'pokestats-language'

function getStoredLanguage(): Language {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === 'japanese' ? 'japanese' : 'english'
}

export function RegionProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [language, setLanguage] = useState<Language>(() => getStoredLanguage())

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, language)
  }, [language])

  const value = useMemo(() => ({ language, setLanguage }), [language])

  return <RegionContext.Provider value={value}>{children}</RegionContext.Provider>
}

export function useRegion(): RegionContextValue {
  const context = useContext(RegionContext)
  if (!context) {
    throw new Error('useRegion must be used within RegionProvider')
  }
  return context
}
