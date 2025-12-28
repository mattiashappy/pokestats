import { Layers, LayoutTemplate } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'

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

      <Card>
        <CardHeader>
          <CardTitle>Coming soon</CardTitle>
          <CardDescription>Set-level analytics and release information will appear here.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/60">
          <LayoutTemplate className="h-5 w-5 text-slate-500" />
          <p className="text-sm text-slate-600 dark:text-slate-300">We will surface expansions once the data model supports them.</p>
        </CardContent>
      </Card>
    </div>
  )
}
