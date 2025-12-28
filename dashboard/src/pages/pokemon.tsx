import { BookOpen, LayoutList, Layers, ListTree, Sparkles } from 'lucide-react'

import { Badge } from '../components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { pokemonEras } from '../data/pokemon'

export function PokemonPage(): JSX.Element {
  const eraCount = pokemonEras.length
  const allSets = pokemonEras.flatMap((era) => era.sets.map((set) => ({ ...set, era })))
  const setCount = allSets.length
  const knownCardTotal = allSets.reduce((total, set) => total + (set.cardTotal ?? 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Sparkles className="h-5 w-5 text-amber-500" />
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pokémon</p>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">Pokémon browser</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Organize the enriched catalogue by era, sets, and the cards contained within each set.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex items-center gap-3">
            <div className="rounded-full bg-amber-100 p-2 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
              <LayoutList className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>Era first</CardTitle>
              <CardDescription>Start with the Scarlet &amp; Violet era.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-900/70 dark:text-slate-300">
              <span className="text-slate-500">Level 1</span>
              <Badge variant="secondary">Era</Badge>
            </div>
            <p>
              All Pokémon data is grouped under the Scarlet &amp; Violet era for now so enrichment stays aligned with the
              current Tradera imports.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center gap-3">
            <div className="rounded-full bg-sky-100 p-2 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200">
              <Layers className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>Sets within the era</CardTitle>
              <CardDescription>Ordered by release codes (SV10.5 → SV1).</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-900/70 dark:text-slate-300">
              <span className="text-slate-500">Level 2</span>
              <Badge variant="secondary">Set</Badge>
            </div>
            <p>Each set maintains the original Tradera data but can be enriched with additional card context.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center gap-3">
            <div className="rounded-full bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
              <ListTree className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>Cards per set</CardTitle>
              <CardDescription>Counts are tracked without altering source auctions.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-900/70 dark:text-slate-300">
              <span className="text-slate-500">Level 3</span>
              <Badge variant="secondary">Cards</Badge>
            </div>
            <p>
              Card totals (e.g. 200 in Paldean Fates) are documented here as enrichment complements; the underlying Tradera
              auction rows remain untouched.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-slate-400" />
              Era overview
            </CardTitle>
            <CardDescription>Rollup of eras, sets, and the card counts captured so far.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <span className="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-900/70">{eraCount} era</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-900/70">{setCount} sets</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-900/70">
              {knownCardTotal.toLocaleString('sv-SE')} cards tracked
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {pokemonEras.map((era) => (
            <div key={era.code} className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <Badge variant="secondary" className="uppercase">{era.code}</Badge>
                  <div>
                    <p className="text-lg font-semibold text-slate-900 dark:text-slate-50">{era.name}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">{era.description}</p>
                  </div>
                </div>
                <div className="text-right text-xs uppercase tracking-wide text-slate-500">
                  <p>{era.sets.length} sets</p>
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {era.sets.map((set) => (
                  <div
                    key={set.code}
                    className="flex flex-col gap-1 rounded-md bg-slate-50 p-3 text-sm text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900/60 dark:text-slate-200 dark:ring-slate-800"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="uppercase">{set.code}</Badge>
                      <p className="font-semibold text-slate-900 dark:text-slate-50">{set.name}</p>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                      <span>Cards</span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {set.cardTotal ? `${set.cardTotal.toLocaleString('sv-SE')}` : 'TBD'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{set.notes ?? 'Awaiting detailed count.'}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-slate-400" />
            Set catalogue
          </CardTitle>
          <CardDescription>Flattened list of the Scarlet &amp; Violet sets with card totals for enrichment.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Set</TableHead>
                  <TableHead>Era</TableHead>
                  <TableHead>Cards</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allSets.map((set) => (
                  <TableRow key={`${set.era.code}-${set.code}`}>
                    <TableCell className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="uppercase">{set.code}</Badge>
                        <span className="font-semibold text-slate-900 dark:text-slate-50">{set.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-slate-600 dark:text-slate-300">{set.era.name}</TableCell>
                    <TableCell className="text-slate-600 dark:text-slate-300">
                      {set.cardTotal ? `${set.cardTotal.toLocaleString('sv-SE')} cards` : 'TBD'}
                    </TableCell>
                    <TableCell className="text-slate-500 dark:text-slate-400">{set.notes ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
