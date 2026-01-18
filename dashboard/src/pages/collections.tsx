import { Link } from 'react-router-dom'
import { Archive, BookOpen, NotebookPen, Sparkles } from 'lucide-react'

const highlights = [
  {
    title: 'Binder-ready tracking',
    description: 'Keep a personal log of every card you own, including condition, language, and purchase notes.'
  },
  {
    title: 'Collection value',
    description: 'Track market value snapshots alongside what you paid to spot wins in your binder.'
  },
  {
    title: 'Wishlist pipeline',
    description: 'Flag missing cards and jump straight into sets to continue your hunt.'
  }
]

const placeholders = [
  { label: 'Base Set Charizard', detail: '1st Edition • NM' },
  { label: 'Neo Genesis Lugia', detail: 'Unlimited • LP' },
  { label: 'Evolving Skies Umbreon VMAX', detail: 'Alt Art • PSA 10' }
]

export function CollectionsPage(): JSX.Element {
  return (
    <div className="space-y-10">
      <section className="grid gap-6 rounded-3xl border-2 border-slate-900 bg-white p-8 shadow-[6px_6px_0px_#0f172a] md:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border-2 border-slate-900 bg-amber-200 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-900 shadow-[2px_2px_0px_#0f172a]">
            <Sparkles className="h-4 w-4" />
            Collection binder
          </div>
          <h1 className="text-3xl font-black text-slate-900 md:text-4xl">Organize every card you own in one place.</h1>
          <p className="text-base text-slate-600">
            Build a personal binder that tracks condition, value, and notes for every Pokémon card in your collection.
            Add cards as you go and keep a living record of what is in your vault.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/sets"
              className="flex items-center gap-2 border-2 border-slate-900 bg-lime-200 px-4 py-2 text-xs font-bold uppercase tracking-wide shadow-[3px_3px_0px_#0f172a] transition hover:-translate-y-0.5 hover:bg-slate-900 hover:text-white"
            >
              <NotebookPen className="h-4 w-4" />
              Add cards from sets
            </Link>
            <Link
              to="/dashboard"
              className="flex items-center gap-2 border-2 border-slate-900 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wide shadow-[3px_3px_0px_#0f172a] transition hover:-translate-y-0.5 hover:bg-slate-900 hover:text-white"
            >
              <BookOpen className="h-4 w-4" />
              Explore market dashboard
            </Link>
          </div>
        </div>
        <div className="space-y-4 rounded-2xl border-2 border-slate-900 bg-slate-50 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Binder preview</p>
          <div className="space-y-3">
            {placeholders.map((card) => (
              <div
                key={card.label}
                className="flex items-center justify-between gap-3 rounded-xl border-2 border-slate-900 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-[2px_2px_0px_#0f172a]"
              >
                <span>{card.label}</span>
                <span className="text-xs uppercase tracking-wide text-slate-500">{card.detail}</span>
              </div>
            ))}
          </div>
          <div className="rounded-xl border-2 border-dashed border-slate-400 px-4 py-6 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
            Start adding cards to see your binder fill up.
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {highlights.map((item) => (
          <div
            key={item.title}
            className="space-y-2 rounded-2xl border-2 border-slate-900 bg-white p-5 shadow-[4px_4px_0px_#0f172a]"
          >
            <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-800">
              <Archive className="h-4 w-4" />
              {item.title}
            </div>
            <p className="text-sm text-slate-600">{item.description}</p>
          </div>
        ))}
      </section>
    </div>
  )
}
