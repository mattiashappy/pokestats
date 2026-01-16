import { format } from 'date-fns'
import { Layers } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Badge } from '../ui/badge'
import { Card, CardContent } from '../ui/card'
import type { ExpansionSummary } from '../../types'

type SetCardProps = {
  expansion: ExpansionSummary
}

export function SetCard({ expansion }: SetCardProps): JSX.Element {
  const releaseLabel = expansion.release_date
    ? `Released ${format(new Date(expansion.release_date), 'PP')}`
    : 'Release date pending'

  const cardsLabel = expansion.set_total ?? expansion.cards_total
  const auctionsLabel = expansion.linked_auctions ?? 0
  const hasAuctionsLinked = auctionsLabel > 0
  const setLink = `/sets/${expansion.set_code}`

  return (
    <Link to={setLink} className="group block h-full">
      <Card className="flex h-full flex-col overflow-hidden border-slate-200/80 shadow-none transition hover:-translate-y-1 hover:shadow-md dark:border-slate-800/80">
        <div className="relative bg-gradient-to-br from-slate-100 to-white pb-[56.25%] dark:from-slate-900 dark:to-slate-950">
          {expansion.image_url ? (
            <img
              src={expansion.image_url}
              alt={expansion.name ?? expansion.set_code}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-3xl font-black tracking-tight text-slate-300 dark:text-slate-700">
              {expansion.set_code}
            </div>
          )}

          <Badge className="absolute left-3 top-3 bg-slate-900/80 text-xs uppercase text-white backdrop-blur-sm transition group-hover:bg-sky-600">
            {expansion.set_code}
          </Badge>
        </div>

        <CardContent className="flex flex-1 flex-col gap-3 p-4">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pokémon set</p>
            <p className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              {expansion.name ?? 'Unknown set'}
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400">{releaseLabel}</p>
          </div>

          <div className="mt-auto flex flex-wrap items-center gap-3 text-sm text-slate-700 dark:text-slate-200">
            <span className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <Layers className="h-3.5 w-3.5" />
              {cardsLabel ? `${cardsLabel} cards` : 'Cards pending'}
            </span>

            {hasAuctionsLinked && (
              <>
                <span className="text-xs text-slate-500 dark:text-slate-400">·</span>

                <span className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  {auctionsLabel.toLocaleString('sv-SE')} auctions linked
                </span>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
