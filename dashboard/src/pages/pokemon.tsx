import { BookOpen, Sparkles } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'

export function PokemonPage(): JSX.Element {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Sparkles className="h-5 w-5 text-amber-500" />
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pokémon</p>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">Pokémon browser</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">Explore Pokémon data once the archive is expanded.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Coming soon</CardTitle>
          <CardDescription>Card and species exploration will live here in the future.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/60">
          <BookOpen className="h-5 w-5 text-slate-500" />
          <p className="text-sm text-slate-600 dark:text-slate-300">We are preparing a dedicated Pokémon catalogue experience.</p>
        </CardContent>
      </Card>
    </div>
  )
}
