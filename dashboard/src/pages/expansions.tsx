import { Layers } from 'lucide-react'

import { TransportBadge } from '@/components/blocks/transport-badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { expansions, type Expansion } from '@/data/expansions'

const eraGroups = expansions.reduce<Record<string, Expansion[]>>((acc, expansion) => {
  if (!acc[expansion.era]) {
    acc[expansion.era] = []
  }
  acc[expansion.era].push(expansion)
  return acc
}, {})

export function ExpansionsPage(): JSX.Element {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Layers className="h-5 w-5 text-sky-500" />
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Expansions</p>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">Expansion library</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">Browse set lists and breakdowns as they become available.</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Set codes</p>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-50">Use expansion codes as the primary key</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Each badge mirrors the set code stored in the database so you can scan, filter, and click through to the matching cards.
            </p>
          </div>
        </div>

        <div className="space-y-8">
          {Object.entries(eraGroups).map(([era, eraExpansions]) => (
            <div key={era} className="space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Era</p>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{era}</h3>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {eraExpansions.map((expansion) => (
                  <Card
                    key={`${era}-${expansion.code}`}
                    className="border-slate-200/80 shadow-none ring-1 ring-slate-200/70 dark:border-slate-800/80 dark:ring-slate-800/80"
                  >
                    <CardHeader className="space-y-3 pb-3">
                      <TransportBadge
                        system="PKMN"
                        stationCode={expansion.code}
                        highlight={expansion.highlight}
                        className="w-fit"
                      />
                      <div>
                        <CardTitle className="text-xl text-slate-900 dark:text-slate-50">{expansion.name}</CardTitle>
                        <CardDescription>Released {expansion.release}</CardDescription>
                      </div>
                    </CardHeader>
                    <CardContent className="flex items-center justify-between border-t border-dashed border-slate-200 pt-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">
                      <div className="flex flex-col">
                        <span className="text-xs uppercase tracking-wide text-slate-500">Cards</span>
                        <span className="font-semibold text-slate-900 dark:text-white">{expansion.totalCards}</span>
                      </div>
                      <div className="flex flex-col text-right">
                        <span className="text-xs uppercase tracking-wide text-slate-500">Secret rares</span>
                        <span className="font-semibold text-slate-900 dark:text-white">{expansion.secretRares}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
