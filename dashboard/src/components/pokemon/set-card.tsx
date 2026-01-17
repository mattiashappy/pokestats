import { Link } from 'react-router-dom'

import { Card, CardContent } from '../ui/card'
import { getExpansionIdentifier } from '../../lib/sets'
import type { ExpansionSummary } from '../../types'

type SetCardProps = {
  expansion: ExpansionSummary
}

export function SetCard({ expansion }: SetCardProps): JSX.Element {
  const cardsLabel = expansion.set_total ?? expansion.cards_total
  const setIdentifier = getExpansionIdentifier(expansion)
  const setLink = `/sets/${setIdentifier}`
  const imageUrl =
    expansion.image_cdn_url800 ?? expansion.image_cdn_url400 ?? expansion.image_cdn_url200 ?? expansion.image_url

  return (
    <Link to={setLink} className="group block h-full">
      <Card className="flex h-full flex-col overflow-hidden border-slate-200/80 shadow-none transition hover:-translate-y-1 hover:shadow-md dark:border-slate-800/80">
        <div className="relative bg-gradient-to-br from-slate-100 to-white pb-[56.25%] dark:from-slate-900 dark:to-slate-950">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={expansion.name ?? setIdentifier}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-3xl font-black tracking-tight text-slate-300 dark:text-slate-700">
              Set image unavailable
            </div>
          )}
        </div>

        <CardContent className="flex flex-1 flex-col gap-3 p-4">
          <div className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            {expansion.name ?? 'Unknown set'}
          </div>

          <div className="space-y-2 text-sm text-slate-700 dark:text-slate-200">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cards</span>
              <span className="font-semibold">{cardsLabel ? `${cardsLabel} cards` : 'Cards pending'}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total set value</span>
              <span className="font-semibold text-slate-500 dark:text-slate-400">Pending</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Avg</span>
              <span className="font-semibold text-slate-500 dark:text-slate-400">Pending</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Change</span>
              <span className="font-semibold text-slate-500 dark:text-slate-400">Pending</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
