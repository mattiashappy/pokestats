import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, ImageIcon, Link2, Loader2, Plus, Search, Unlink2 } from 'lucide-react'

import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Select } from '../components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import {
  fetchEnrichmentAuction,
  fetchEnrichmentAuctions,
  createEnrichmentCard,
  linkEnrichmentAuction,
  reprocessEnrichmentAuctions,
  searchEnrichmentCards,
  unlinkEnrichmentAuction
} from '../lib/api'
import type { EnrichmentAuction } from '../types'

const PAGE_SIZE = 50

type Filters = {
  linked: boolean | null
  confidence: string
  q: string
  hasImage: boolean
  page: number
}

function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(handle)
  }, [value, delay])
  return debounced
}

type AuctionDetailProps = {
  auction: EnrichmentAuction | null
  onSelectCard?: (id: number) => void
  selectedCardId?: number | null
}

function AuctionDetail({ auction, onSelectCard, selectedCardId }: AuctionDetailProps): JSX.Element | null {
  const [search, setSearch] = useState('')
  const debounced = useDebouncedValue(search, 250)

  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newCardName, setNewCardName] = useState('')
  const [newCardSetName, setNewCardSetName] = useState('')
  const [newCardSetCode, setNewCardSetCode] = useState('')
  const [newCardNumber, setNewCardNumber] = useState('')
  const [newCardImageUrl, setNewCardImageUrl] = useState('')

  const { data: cardResults, isFetching: searching } = useQuery({
    queryKey: ['enrichment-card-search', debounced],
    enabled: Boolean(debounced?.length >= 2),
    queryFn: () => searchEnrichmentCards(debounced)
  })

  const createCard = useMutation({
    mutationFn: () =>
      createEnrichmentCard({
        name: newCardName,
        set_name: newCardSetName,
        set_code: newCardSetCode || null,
        card_number: newCardNumber || null,
        image_url: newCardImageUrl || null,
        era: auction?.attributes?.pokemon_era?.[0] ?? null
      }),
    onSuccess: (card) => {
      onSelectCard?.(card.id)
      setShowCreateForm(false)
      setNewCardName('')
      setNewCardSetName('')
      setNewCardSetCode('')
      setNewCardNumber('')
      setNewCardImageUrl('')
    }
  })

  useEffect(() => {
    if (auction) {
      setNewCardName(auction.title ?? '')
      setNewCardSetName(auction.parsed_set_hint ?? '')
      setNewCardSetCode(auction.parsed_set_hint ?? '')
      setNewCardNumber(auction.parsed_card_number ?? '')
    } else {
      setNewCardName('')
      setNewCardSetName('')
      setNewCardSetCode('')
      setNewCardNumber('')
      setNewCardImageUrl('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auction?.item_id])

  if (!auction) return null

  const primaryImage = auction.thumbnail_url || auction.image_urls?.[0] || null

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase text-slate-500">Auction</p>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{auction.title ?? 'Untitled'}</h3>
          <p className="text-sm text-slate-500">{auction.item_id}</p>
        </div>
        {auction.item_url ? (
          <a href={auction.item_url} target="_blank" rel="noreferrer" className="text-sky-600 hover:underline">
            View on Tradera
            <ExternalLink className="ml-1 inline h-4 w-4" />
          </a>
        ) : null}
      </div>

      {primaryImage ? (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900/60">
          <img src={primaryImage} alt={auction.title ?? 'auction image'} className="w-full" />
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-800">
          <ImageIcon className="h-4 w-4" /> No image found
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="font-medium text-slate-700 dark:text-slate-200">Match</span>
          <span>{auction.match_confidence ?? 'unknown'}</span>
          <span>•</span>
          <span>{auction.match_method ?? 'unmatched'}</span>
          {auction.card ? (
            <span className="ml-2 rounded bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {auction.card.name} {auction.card.card_number ? `(${auction.card.card_number})` : ''}
            </span>
          ) : (
            <span className="ml-2 rounded bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
              Not linked
            </span>
          )}
        </div>
      </div>

      <div>
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Search card to link</label>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search card name / number / set"
              className="pl-8"
            />
          </div>
          {searching ? <Loader2 className="h-5 w-5 animate-spin text-slate-500" /> : null}
        </div>

        <div className="mt-3 space-y-2">
          {(cardResults?.length ?? 0) > 0 ? (
            cardResults?.map((card) => (
              <button
                type="button"
                key={card.id}
                onClick={() => onSelectCard?.(card.id)}
                className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm shadow-sm transition hover:border-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 dark:border-slate-800 dark:bg-slate-900 ${
                  selectedCardId === card.id
                    ? 'border-sky-500 ring-2 ring-sky-300 dark:ring-sky-700'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div>
                  <div className="font-medium text-slate-900 dark:text-slate-100">{card.name}</div>
                  <div className="text-xs text-slate-500">
                    {card.set_name ?? 'Unknown set'} {card.card_number ? `• ${card.card_number}` : null}
                  </div>
                </div>
                {card.image_url ? (
                  <img
                    src={card.image_url}
                    alt={card.name}
                    className="h-12 w-9 rounded border border-slate-200 object-contain"
                  />
                ) : null}
              </button>
            ))
          ) : (
            <p className="text-xs text-slate-500">Type to search cards</p>
          )}
        </div>

        <div className="mt-4 rounded-md border border-dashed border-slate-300 p-3 dark:border-slate-800">
          <button
            type="button"
            className="flex items-center gap-2 text-sm font-medium text-slate-700 transition hover:text-sky-600 dark:text-slate-200"
            onClick={() => setShowCreateForm((v) => !v)}
          >
            <Plus className="h-4 w-4" /> {showCreateForm ? 'Hide new card form' : 'Add new card manually'}
          </button>

          {showCreateForm ? (
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <Input placeholder="Card name" value={newCardName} onChange={(e) => setNewCardName(e.target.value)} />
              <Input placeholder="Set name" value={newCardSetName} onChange={(e) => setNewCardSetName(e.target.value)} />
              <Input
                placeholder="Set code (optional)"
                value={newCardSetCode}
                onChange={(e) => setNewCardSetCode(e.target.value)}
              />
              <Input
                placeholder="Card number (e.g. 57/132)"
                value={newCardNumber}
                onChange={(e) => setNewCardNumber(e.target.value)}
              />
              <Input
                placeholder="Image URL (optional)"
                value={newCardImageUrl}
                onChange={(e) => setNewCardImageUrl(e.target.value)}
              />
              <Button
                onClick={() => createCard.mutate()}
                disabled={createCard.isPending || !newCardName || !newCardSetName}
                variant="secondary"
              >
                {createCard.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Create card
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Raw data</p>
        <pre className="max-h-96 overflow-auto rounded-lg border border-slate-200 bg-slate-950/90 p-3 text-xs text-slate-100 dark:border-slate-800">
          {JSON.stringify(auction, null, 2)}
        </pre>
      </div>
    </div>
  )
}

export function DataEnrichmentPage(): JSX.Element {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'raw' | 'image'>('raw')
  const [filters, setFilters] = useState<Filters>({ linked: false, confidence: '', q: '', hasImage: false, page: 1 })
  const [selectedAuctionId, setSelectedAuctionId] = useState<number | null>(null)
  const [selectedCardId, setSelectedCardId] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [showDetailModal, setShowDetailModal] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['enrichment-auctions', filters],
    queryFn: () =>
      fetchEnrichmentAuctions({
        linked: filters.linked ?? undefined,
        confidence: filters.confidence || null,
        q: filters.q || null,
        hasImage: filters.hasImage,
        page: filters.page,
        pageSize: PAGE_SIZE
      })
  })

  const selectedAuction = useQuery({
    queryKey: ['enrichment-auction', selectedAuctionId],
    enabled: selectedAuctionId != null,
    queryFn: () => fetchEnrichmentAuction(selectedAuctionId as number)
  })

  const linkMutation = useMutation({
    mutationFn: (payload: { auctionId: number; cardId: number }) =>
      linkEnrichmentAuction(payload.auctionId, {
        card_id: payload.cardId,
        match_confidence: 'medium',
        match_method: activeTab === 'image' ? 'image_only' : 'manual',
        notes: notes || null
      }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['enrichment-auctions'] })
      queryClient.setQueryData(['enrichment-auction', updated.item_id], updated)
      if (showDetailModal) {
        setShowDetailModal(false)
        setSelectedAuctionId(null)
        setSelectedCardId(null)
      }
    }
  })

  const unlinkMutation = useMutation({
    mutationFn: (auctionId: number) => unlinkEnrichmentAuction(auctionId, notes || null),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['enrichment-auctions'] })
      queryClient.setQueryData(['enrichment-auction', updated.item_id], updated)
      if (showDetailModal) {
        setShowDetailModal(false)
        setSelectedAuctionId(null)
        setSelectedCardId(null)
      }
    }
  })

  const reprocessMutation = useMutation({
    mutationFn: () => reprocessEnrichmentAuctions(200, true),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['enrichment-auctions'] })
  })

  const handleLink = (auctionId: number, cardId: number) => {
    setSelectedCardId(cardId)
    linkMutation.mutate({ auctionId, cardId })
  }

  const hardCases = useMemo(() => {
    const items = data?.items ?? []
    return items.filter((item) => !item.card_id && !item.parsed_card_number && (item.thumbnail_url || item.image_urls?.length))
  }, [data])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (activeTab !== 'image') return
      if (e.key.toLowerCase() === 'n' && hardCases.length) {
        setSelectedAuctionId(hardCases[1]?.item_id ?? hardCases[0]?.item_id ?? null)
      }
      if (e.key.toLowerCase() === 'u' && selectedAuctionId) {
        unlinkMutation.mutate(selectedAuctionId)
      }
      if (e.key === 'Enter' && selectedAuctionId && selectedCardId) {
        linkMutation.mutate({ auctionId: selectedAuctionId, cardId: selectedCardId })
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [activeTab, hardCases, linkMutation, selectedAuctionId, selectedCardId, unlinkMutation])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Data Enrichment</p>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Auction mappings</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => setActiveTab('raw')}
            className={activeTab === 'raw' ? 'bg-sky-100 dark:bg-sky-900/30' : ''}
          >
            Auctions (Raw)
          </Button>
          <Button
            variant="secondary"
            onClick={() => setActiveTab('image')}
            className={activeTab === 'image' ? 'bg-sky-100 dark:bg-sky-900/30' : ''}
          >
            Manual Link (Image-first)
          </Button>
          <Button onClick={() => reprocessMutation.mutate()} disabled={reprocessMutation.isPending}>
            {reprocessMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Reprocess unmatched
          </Button>
        </div>
      </div>

      {activeTab === 'raw' ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Auctions (Raw)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={filters.linked === false}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, linked: e.target.checked ? false : null, page: 1 }))
                  }
                  className="h-4 w-4"
                />
                Unlinked only
              </label>

              <Select value={filters.confidence} onChange={(e) => setFilters((f) => ({ ...f, confidence: e.target.value, page: 1 }))}>
                <option value="">Any confidence</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
                <option value="unmatched">Unmatched</option>
              </Select>

              <Input
                placeholder="Search title, url, seller"
                value={filters.q}
                onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value, page: 1 }))}
              />

              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={filters.hasImage}
                  onChange={(e) => setFilters((f) => ({ ...f, hasImage: e.target.checked, page: 1 }))}
                  className="h-4 w-4"
                />
                Has image only
              </label>

              <div className="text-right text-sm text-slate-600 dark:text-slate-300">
                Page {data?.page ?? 1} / {Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE))}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Thumb</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Era</TableHead>
                    <TableHead>Linked card</TableHead>
                    <TableHead>Match</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center">
                        <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-500" />
                      </TableCell>
                    </TableRow>
                  ) : (
                    (data?.items ?? []).map((auction) => (
                      <TableRow key={auction.item_id} className="align-top">
                        <TableCell className="w-20">
                          {auction.thumbnail_url ? (
                            <img src={auction.thumbnail_url} alt={auction.title ?? ''} className="h-16 w-16 rounded object-cover" />
                          ) : (
                            <div className="flex h-16 w-16 items-center justify-center rounded bg-slate-100 text-slate-400">
                              <ImageIcon className="h-4 w-4" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-slate-900 dark:text-slate-100">{auction.title ?? 'Untitled'}</div>
                          <div className="text-xs text-slate-500">{auction.item_id}</div>
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">{auction.attributes?.pokemon_era?.[0] ?? '—'}</TableCell>
                        <TableCell className="text-sm">
                          {auction.card ? (
                            <div>
                              <div className="font-medium">{auction.card.name}</div>
                              <div className="text-xs text-slate-500">
                                {auction.card.set_name} {auction.card.card_number ? `• ${auction.card.card_number}` : ''}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-amber-600">Not linked</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs uppercase text-slate-500">
                          <div>{auction.match_confidence ?? 'unknown'}</div>
                          <div className="text-[11px] text-slate-400">{auction.match_method ?? 'unmatched'}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setSelectedAuctionId(auction.item_id)
                                setSelectedCardId(null)
                                setShowDetailModal(true)
                              }}
                            >
                              View
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => unlinkMutation.mutate(auction.item_id)}
                              disabled={unlinkMutation.isPending}
                            >
                              <Unlink2 className="mr-1 h-4 w-4" />
                              Unlink
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between text-sm text-slate-600">
              <Button
                variant="secondary"
                disabled={(filters.page ?? 1) <= 1}
                onClick={() => setFilters((f) => ({ ...f, page: Math.max(1, f.page - 1) }))}
              >
                Previous
              </Button>
              <div>
                Showing {(data?.items?.length ?? 0)} of {data?.total ?? 0} auctions
              </div>
              <Button
                variant="secondary"
                disabled={(filters.page ?? 1) >= Math.ceil((data?.total ?? 0) / PAGE_SIZE)}
                onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
              >
                Next
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {activeTab === 'image' ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Manual link (image-first)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {hardCases.length === 0 ? (
              <p className="text-sm text-slate-500">No unmatched auctions with images right now.</p>
            ) : (
              hardCases.slice(0, 1).map((auction) => (
                <div key={auction.item_id} className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-3">
                    <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900/60">
                      {auction.thumbnail_url ? (
                        <img src={auction.thumbnail_url} alt={auction.title ?? ''} className="w-full" />
                      ) : (
                        <div className="flex h-64 items-center justify-center text-slate-500">
                          <ImageIcon className="h-6 w-6" />
                        </div>
                      )}
                    </div>
                    <div className="space-y-1">
                      <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">{auction.title}</div>
                      <div className="text-xs text-slate-500">{auction.item_id}</div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <AuctionDetail auction={auction} onSelectCard={setSelectedCardId} selectedCardId={selectedCardId} />
                    <div className="flex gap-2">
                      <Button onClick={() => handleLink(auction.item_id, selectedCardId ?? 0)} disabled={!selectedCardId || linkMutation.isPending}>
                        {linkMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
                        Link selected
                      </Button>
                      <Button variant="secondary" onClick={() => unlinkMutation.mutate(auction.item_id)} disabled={unlinkMutation.isPending}>
                        <Unlink2 className="mr-2 h-4 w-4" />
                        Mark unmatched
                      </Button>
                    </div>
                    <p className="text-xs text-slate-500">Keyboard: Enter=link, N=next, U=unmatched</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ) : null}

      {showDetailModal && selectedAuctionId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-5xl rounded-lg bg-white shadow-2xl dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Auction detail</p>
                <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{selectedAuction.data?.title ?? 'Untitled'}</p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setShowDetailModal(false)
                  setSelectedAuctionId(null)
                  setSelectedCardId(null)
                }}
              >
                Close
              </Button>
            </div>
            <div className="grid gap-4 px-4 py-4 md:grid-cols-2">
              <div className="space-y-3">
                {selectedAuction.isFetching ? (
                  <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
                ) : (
                  <AuctionDetail auction={selectedAuction.data ?? null} onSelectCard={setSelectedCardId} selectedCardId={selectedCardId} />
                )}
              </div>
              <div className="space-y-3">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Link / notes</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Input
                      placeholder="Card ID to link"
                      value={selectedCardId ?? ''}
                      onChange={(e) => setSelectedCardId(Number(e.target.value) || null)}
                    />
                    <Input placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
                    <div className="flex gap-2">
                      <Button
                        onClick={() => selectedAuctionId && selectedCardId && handleLink(selectedAuctionId, selectedCardId)}
                        disabled={!selectedAuctionId || !selectedCardId || linkMutation.isPending}
                      >
                        {linkMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
                        Link
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={!selectedAuctionId || unlinkMutation.isPending}
                        onClick={() => selectedAuctionId && unlinkMutation.mutate(selectedAuctionId)}
                      >
                        <Unlink2 className="mr-2 h-4 w-4" />
                        Mark unmatched
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}