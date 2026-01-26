import { Link } from 'react-router-dom'

import { ImageCard } from '../ui/image-card'
import { getExpansionIdentifier } from '../../lib/sets'
import type { ExpansionSummary } from '../../types'

type SetCardProps = {
  expansion: ExpansionSummary
  language?: string
}

export function SetCard({ expansion, language }: SetCardProps): JSX.Element {
  const cardsLabel = expansion.set_total ?? expansion.cards_total
  const setIdentifier = getExpansionIdentifier(expansion)
  const params = language ? new URLSearchParams({ language }).toString() : ''
  const setLink = params ? `/sets/${setIdentifier}?${params}` : `/sets/${setIdentifier}`
  const imageUrl =
    expansion.image_cdn_url800 ?? expansion.image_cdn_url400 ?? expansion.image_cdn_url200 ?? expansion.image_url
  const formatMarketTotal = (value: number | null | undefined): string => {
    if (value === null || value === undefined) return 'Pending'
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return 'Pending'
    return `$${parsed.toFixed(2)}`
  }

  return (
    <Link to={setLink} className="group block h-full">
      <ImageCard caption={expansion.name ?? 'Unknown set'} imageUrl={imageUrl}>
        <div className="space-y-2 text-sm text-slate-700">
          <div className="flex items-center justify-between gap-3 border-2 border-slate-900 bg-amber-50 px-3 py-2 font-semibold shadow-[2px_2px_0px_#0f172a]">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-700">Cards</span>
            <span>{cardsLabel ? `${cardsLabel} cards` : 'Cards pending'}</span>
          </div>
          <div className="flex items-center justify-between gap-3 border-2 border-slate-900 bg-white px-3 py-2 font-semibold shadow-[2px_2px_0px_#0f172a]">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-700">Total set value</span>
            <span className="text-slate-600">{formatMarketTotal(expansion.set_market_total)}</span>
          </div>
          <div className="flex items-center justify-between gap-3 border-2 border-slate-900 bg-white px-3 py-2 font-semibold shadow-[2px_2px_0px_#0f172a]">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-700">Change</span>
            <span className="text-slate-600">0%</span>
          </div>
        </div>
      </ImageCard>
    </Link>
  )
}
