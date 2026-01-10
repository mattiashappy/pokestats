export function normalizeEraCode(value?: string | null): string | null {
  if (!value) return null
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  return normalized.length > 0 ? normalized : null
}

export function formatEraYears(startYear?: number | null, endYear?: number | null): string {
  if (!startYear && !endYear) return 'Year range pending'
  if (startYear && endYear) return `${startYear}–${endYear}`
  if (startYear && !endYear) return `${startYear}–present`
  if (!startYear && endYear) return `Up to ${endYear}`
  return 'Year range pending'
}
