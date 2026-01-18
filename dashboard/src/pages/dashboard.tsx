import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import DataTable from '../components/ui/data-table'
import { fetchCardDetails } from '../lib/api'
import type { CardResponse } from '../types'

export function DashboardPage(): JSX.Element {
  const featuredCardId = '68af87b6c4f780b5153e99c5'
  const { data: featuredCard } = useQuery<CardResponse>({
    queryKey: ['featured-card', featuredCardId],
    queryFn: () => fetchCardDetails(featuredCardId)
  })
  const catalogRows = [
    {
      id: '1',
      card: 'Charizard Holo #4',
      set: 'Base Set',
      price: '12 450 kr',
      change: '+18.2%',
      changeTone: 'text-emerald-600'
    },
    {
      id: '2',
      card: 'Umbreon VMAX #215',
      set: 'Evolving Skies',
      price: '3 200 kr',
      change: '+7.5%',
      changeTone: 'text-emerald-600'
    },
    {
      id: '3',
      card: 'Blastoise Holo #2',
      set: 'Base Set',
      price: '4 980 kr',
      change: '-2.1%',
      changeTone: 'text-rose-600'
    },
    {
      id: '4',
      card: 'Gengar VMAX #271',
      set: 'Fusion Strike',
      price: '2 150 kr',
      change: '+4.9%',
      changeTone: 'text-emerald-600'
    },
    {
      id: '5',
      card: 'Lugia V #186',
      set: 'Silver Tempest',
      price: '1 890 kr',
      change: '-1.4%',
      changeTone: 'text-rose-600'
    }
  ]

  return (
    <div className="space-y-12">
      <section className="grid gap-10 lg:grid-cols-[1.05fr_1fr] lg:items-center">
        <div className="relative">
          <div className="relative flex min-h-[360px] items-center justify-center">
            <div className="absolute left-4 top-4 z-10 border-2 border-slate-900 bg-emerald-200 px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-900 shadow-[3px_3px_0px_#0f172a]">
              ROI <span className="text-lg">302%</span>
            </div>
            {featuredCard?.image_url ? (
              <img
                src={featuredCard.image_url}
                alt={featuredCard.name ?? 'Featured card'}
                className="h-full max-h-[360px] w-full object-contain"
              />
            ) : (
              <div className="h-80 w-full max-w-xs animate-pulse rounded-lg bg-white/70" />
            )}
          </div>
        </div>

        <div className="space-y-6">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Pokestats Market Lab</p>
          <h2 className="text-3xl font-black text-slate-900 md:text-4xl">
            Pokémon Card Prices in Sweden, Real Sales Data from Tradera
          </h2>
          <p className="text-base text-slate-600">
            Every price is calculated from completed Tradera auctions and updated continuously. Track actual market
            behavior, measure ROI, and discover the next opportunity faster than the competition.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/sets"
              className="border-2 border-slate-900 bg-amber-200 px-5 py-3 text-sm font-bold uppercase tracking-wide shadow-[4px_4px_0px_#0f172a] transition hover:-translate-y-0.5 hover:bg-slate-900 hover:text-white"
            >
              Pokémon Sets
            </Link>
            <div className="rounded-full border-2 border-slate-900 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
              Live auction coverage
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-2xl font-black text-slate-900">Card catalog</h3>
            <p className="text-sm text-slate-600">Search and filter across every card in the database.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 rounded-full border-2 border-slate-900 bg-white px-3 py-2 text-sm shadow-[3px_3px_0px_#0f172a]">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Search</span>
              <input
                className="w-40 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                placeholder="Charizard, Umbreon..."
                type="text"
              />
            </label>
            <button
              className="border-2 border-slate-900 bg-slate-900 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white shadow-[3px_3px_0px_#0f172a] transition hover:-translate-y-0.5 hover:bg-slate-700"
              type="button"
            >
              Filter ▼
            </button>
          </div>
        </div>

        <DataTable>
          <thead className="bg-amber-200">
            <tr className="border-b-2 border-slate-900 text-left text-xs font-bold uppercase tracking-wide text-slate-700">
              <th className="px-4 py-3">Card</th>
              <th className="px-4 py-3">Set</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Change %</th>
              <th className="px-4 py-3 text-right">Link</th>
            </tr>
          </thead>
          <tbody className="divide-y-2 divide-slate-900">
            {catalogRows.map((row) => (
              <tr key={row.id} className="bg-white">
                <td className="px-4 py-4 font-semibold text-slate-900">{row.card}</td>
                <td className="px-4 py-4 text-slate-700">{row.set}</td>
                <td className="px-4 py-4 font-semibold text-slate-900">{row.price}</td>
                <td className={`px-4 py-4 font-semibold ${row.changeTone}`}>{row.change}</td>
                <td className="px-4 py-4 text-right">
                  <button className="inline-flex items-center gap-1 border-2 border-slate-900 bg-white px-2 py-1 text-xs font-bold uppercase tracking-wide text-slate-900 shadow-[2px_2px_0px_#0f172a] transition hover:-translate-y-0.5 hover:bg-slate-900 hover:text-white">
                    View card
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </section>
    </div>
  )
}
