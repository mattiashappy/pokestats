import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { endOfDay, format, setHours, setMinutes, startOfDay, subDays } from 'date-fns'

type ImportSettings = {
  nextImportAt: string
  coverageLabel: string
  coverageStart: string
  coverageEnd: string
  lastImportAt: string
  lastImportStatus: 'success' | 'failed'
  importedCount: number
  oldestAuctionEndedAt: string
  newestAuctionEndedAt: string
}

type AdminSettingsContextValue = {
  importSettings: ImportSettings
  updateImportSchedule: (date: string, time: string) => void
}

const STORAGE_KEY = 'pokestats-import-settings'
const AdminSettingsContext = createContext<AdminSettingsContextValue | undefined>(undefined)

function buildDefaultSchedule(): ImportSettings {
  const now = new Date()
  const nextImport = setMinutes(setHours(now, 9), 30)
  const coverageDate = subDays(nextImport, 1)
  return {
    nextImportAt: nextImport.toISOString(),
    coverageLabel: `Ended Tradera auctions from ${format(coverageDate, 'PPP')}`,
    coverageStart: startOfDay(coverageDate).toISOString(),
    coverageEnd: endOfDay(coverageDate).toISOString(),
    lastImportAt: subDays(now, 0).toISOString(),
    lastImportStatus: 'success',
    importedCount: 128,
    oldestAuctionEndedAt: startOfDay(coverageDate).toISOString(),
    newestAuctionEndedAt: endOfDay(coverageDate).toISOString()
  }
}

function persistSettings(settings: ImportSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

function parseSettings(raw: string | null): ImportSettings | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as ImportSettings
    if (
      parsed.nextImportAt &&
      parsed.coverageStart &&
      parsed.coverageEnd &&
      parsed.coverageLabel &&
      parsed.lastImportAt &&
      parsed.lastImportStatus &&
      typeof parsed.importedCount === 'number' &&
      parsed.oldestAuctionEndedAt &&
      parsed.newestAuctionEndedAt
    ) {
      return parsed
    }
    return null
  } catch (error) {
    console.error('Failed to read import settings', error)
    return null
  }
}

export function AdminSettingsProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [importSettings, setImportSettings] = useState<ImportSettings>(() => {
    const stored = parseSettings(localStorage.getItem(STORAGE_KEY))
    return stored ?? buildDefaultSchedule()
  })

  useEffect(() => {
    persistSettings(importSettings)
  }, [importSettings])

  const updateImportSchedule = (date: string, time: string): void => {
    if (!date || !time) return
    const [hours, minutes] = time.split(':').map(Number)
    const target = setMinutes(setHours(new Date(date), hours), minutes)
    const coverageDate = subDays(target, 1)

    setImportSettings({
      nextImportAt: target.toISOString(),
      coverageLabel: `Ended Tradera auctions from ${format(coverageDate, 'PPP')}`,
      coverageStart: startOfDay(coverageDate).toISOString(),
      coverageEnd: endOfDay(coverageDate).toISOString(),
      lastImportAt: importSettings.lastImportAt,
      lastImportStatus: importSettings.lastImportStatus,
      importedCount: importSettings.importedCount,
      oldestAuctionEndedAt: startOfDay(coverageDate).toISOString(),
      newestAuctionEndedAt: endOfDay(coverageDate).toISOString()
    })
  }

  const value = useMemo(() => ({ importSettings, updateImportSchedule }), [importSettings])

  return <AdminSettingsContext.Provider value={value}>{children}</AdminSettingsContext.Provider>
}

export function useAdminSettings(): AdminSettingsContextValue {
  const ctx = useContext(AdminSettingsContext)
  if (!ctx) {
    throw new Error('useAdminSettings must be used within AdminSettingsProvider')
  }
  return ctx
}
