import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Link2, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { useRegion } from '../contexts/region-context'
import {
  fetchAuctionCardLinks,
  fetchLinkingStats,
  fetchUnlinkedAuctions,
  linkAuctionToCard,
  unlinkAuction,
  runAiMatch,
  runTraderaLink,
  runVisionMatch,
  searchCards
} from '../lib/api'
import type {
  AiMatchSummary,
  AuctionCardLink,
  CardSearchResult,
  LinkingStats,
  MatchLogEntry,
  TraderaLinkSummary,
  UnlinkedAuction,
  UnlinkedAuctionsResponse,
  VisionMatchSummary
} from '../lib/api'

const formatCardLabel = (link: AuctionCardLink): string => {
  const parts = [link.cardName, link.cardNumber].filter(Boolean)
  if (parts.length) return parts.join(' • ')
  return link.cardId ? `Card #${link.cardId}` : '—'
}

const formatSetLabel = (link: AuctionCardLink): string => {
  const parts = [link.setName, link.setCode].filter(Boolean)
  if (parts.length) return parts.join(' • ')
  return '—'
}

const formatConfidence = (confidence: number | null): string => {
  if (confidence == null) return '—'
  return `${(confidence * 100).toFixed(1)}%`
}

const formatLinkedAtCompact = (linkedAt: string | null): string => {
  if (!linkedAt) return '—'
  return format(new Date(linkedAt), 'yyyy-MM-dd HH:mm')
}

const formatDetectedExpansion = (auction: UnlinkedAuction): string => {
  const parts = [auction.detectedExpansionName, auction.detectedExpansionCode].filter(Boolean)
  if (parts.length) return parts.join(' • ')
  return '—'
}

const isLanguageMismatch = (auctionLanguage: string | null | undefined, cardLanguage: string | null | undefined): boolean => {
  const auction = normalizeLanguage(auctionLanguage).toLowerCase()
  const card = normalizeLanguage(cardLanguage).toLowerCase()
  if (auction === 'unknown' || card === 'unknown') return false
  return auction !== card
}

const normalizeLanguage = (language?: string | null): string => {
  const trimmed = language?.trim()
  if (!trimmed) return 'Unknown'
  return trimmed
}

const diagnosticFilterOptions = [
  'Ready to link',
  'Missing title',
  'Missing description',
  'No card #',
  'No set match',
  'No era',
  'No language',
  'No condition'
] as const

type DiagnosticFilterOption = (typeof diagnosticFilterOptions)[number]

const buildDiagnostics = (auction: UnlinkedAuction): string[] => {
  const diagnostics: string[] = []
  if (!auction.title) diagnostics.push('Missing title')
  if (!auction.description) diagnostics.push('Missing description')
  if (!auction.detectedCollectorNumber) diagnostics.push('No card #')
  if (!auction.detectedExpansionName && !auction.detectedExpansionCode) diagnostics.push('No set match')
  if (!auction.pokemonEra) diagnostics.push('No era')
  if (!auction.pokemonLanguage) diagnostics.push('No language')
  if (!auction.itemCondition) diagnostics.push('No condition')
  return diagnostics
}

const orderedSkipReasons = [
  'card_not_unique',
  'bundle_or_bulk',
  'missing_collector_key',
  'missing_set_hint',
  'set_total_mismatch',
  'special_product_line',
  'non_tcg_topps'
]

export function EnrichPage(): JSX.Element {
  const enrichFetchLimit = 200
  const pageSize = 100

  // Queries
  const { data: linkData, isLoading: linksLoading, refetch: refetchLinks } = useQuery<AuctionCardLink[]>({
    queryKey: ['linking-links'],
    queryFn: () => fetchAuctionCardLinks(enrichFetchLimit)
  })

  const { data: linkingStats } = useQuery<LinkingStats>({
    queryKey: ['linking-stats'],
    queryFn: fetchLinkingStats
  })

  // State
  const [languageFilter, setLanguageFilter] = useState('all')
  const [selectedDiagnosticFilters, setSelectedDiagnosticFilters] = useState<DiagnosticFilterOption[]>([])
  const [unlinkedPage, setUnlinkedPage] = useState(1)
  const [selectedAiAuctionIds, setSelectedAiAuctionIds] = useState<number[]>([])
  
  const { data: unlinkedData, isLoading: unlinkedLoading, isError: unlinkedError, refetch: refetchUnlinked } = useQuery<UnlinkedAuctionsResponse>({
    queryKey: ['linking-unlinked', pageSize, unlinkedPage, languageFilter, selectedDiagnosticFilters],
    queryFn: () => fetchUnlinkedAuctions({
      limit: pageSize,
      offset: (unlinkedPage - 1) * pageSize,
      language: languageFilter,
      diagnostics: selectedDiagnosticFilters
    }),
    enabled: true
  })

  // Manual Matching State
  const [searchOpen, setSearchOpen] = useState(false)
  const [selectedAuction, setSelectedAuction] = useState<UnlinkedAuction | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const { language } = useRegion()

  const { data: searchResults = [], isFetching: searchPending } = useQuery<CardSearchResult[]>({
    queryKey: ['linking-search-cards', searchQuery, language],
    queryFn: () => searchCards(searchQuery, 30, 'database', language),
    enabled: searchQuery.trim().length > 0
  })

  // Action States
  const [linkPending, setLinkPending] = useState(false)
  const [linkSummary, setLinkSummary] = useState<TraderaLinkSummary | null>(null)
  const [aiSummary, setAiSummary] = useState<AiMatchSummary | null>(null)
  const [aiPending, setAiPending] = useState(false)
  const [visionSummary, setVisionSummary] = useState<VisionMatchSummary | null>(null)
  const [visionPending, setVisionPending] = useState(false)
  const [enrichLogs, setEnrichLogs] = useState<MatchLogEntry[]>([])
  const [manualLinkPending, setManualLinkPending] = useState(false)

  // Derived Values
  const unlinkedAuctions = unlinkedData?.rows ?? []
  const totalUnlinkedVisible = unlinkedData?.total ?? 0
  const totalUnlinkedPages = Math.max(1, Math.ceil(totalUnlinkedVisible / pageSize))

  const selectedAiSet = useMemo(() => new Set(selectedAiAuctionIds), [selectedAiAuctionIds])
  const visiblePageIds = useMemo(() => unlinkedAuctions.map(a => a.itemId), [unlinkedAuctions])
  const allPageSelected = visiblePageIds.length > 0 && visiblePageIds.every(id => selectedAiSet.has(id))

  const languageOptions = useMemo(() => {
    const values = new Set<string>()
    unlinkedAuctions.forEach(a => values.add(normalizeLanguage(a.pokemonLanguage)))
    return Array.from(values).sort()
  }, [unlinkedAuctions])

  // Handlers
  const handleRunLink = async () => {
    setLinkPending(true)
    try {
      const result = await runTraderaLink()
      setLinkSummary(result)
      await Promise.all([refetchLinks(), refetchUnlinked()])
    } finally {
      setLinkPending(false)
    }
  }

  const toggleDiagnosticFilter = (option: DiagnosticFilterOption) => {
    setSelectedDiagnosticFilters(prev => 
      prev.includes(option) ? prev.filter(o => o !== option) : [...prev, option]
    )
  }

  const toggleAiSelection = (id: number) => {
    setSelectedAiAuctionIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  const handleManualLink = async (cardId: string) => {
    if (!selectedAuction) return
    setManualLinkPending(true)
    try {
      await linkAuctionToCard(selectedAuction.itemId, cardId)
      await Promise.all([refetchLinks(), refetchUnlinked()])
      setSearchOpen(false)
    } finally {
      setManualLinkPending(false)
    }
  }

  const handleUnlink = async (auctionId: number) => {
    await unlinkAuction(auctionId)
    await Promise.all([refetchLinks(), refetchUnlinked()])
  }

  const handleRunAiMatch = async () => {
    if (!selectedAiAuctionIds.length) return
    setAiPending(true)
    try {
      const result = await runAiMatch(selectedAiAuctionIds)
      setAiSummary(result)
      setEnrichLogs(result.logs ?? [])
      await Promise.all([refetchLinks(), refetchUnlinked()])
    } finally {
      setAiPending(false)
    }
  }

  const handleRunVision = async () => {
    if (!selectedAiAuctionIds.length) return
    setVisionPending(true)
    try {
      const result = await runVisionMatch(selectedAiAuctionIds)
      setVisionSummary(result)
      setEnrichLogs(result.logs ?? [])
      await Promise.all([refetchLinks(), refetchUnlinked()])
    } finally {
      setVisionPending(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Admin</p>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">Enrichment</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">Manage Tradera auction links and diagnostic filters.</p>
        </div>
        <Badge variant="secondary" className="gap-2 px-3 py-1">
          <Link2 className="h-4 w-4" />
          {linkingStats?.linked.toLocaleString() ?? 0} Linked
        </Badge>
      </div>

      {/* Linking Actions Card */}
      <Card>
        <CardHeader>
          <CardTitle>Deterministic Linker</CardTitle>
          <CardDescription>Run the automated linker based on title matches.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleRunLink} disabled={linkPending}>
            {linkPending ? 'Processing...' : 'Run Automated Linker'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Title AI Enrichment</CardTitle>
          <CardDescription>Use the selected rows and run the title-based AI matcher.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={handleRunAiMatch} disabled={aiPending || selectedAiAuctionIds.length === 0}>
            {aiPending ? 'Running AI title match...' : `Run Title AI (${selectedAiAuctionIds.length} selected)`}
          </Button>
          {aiSummary ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Last run: scanned {aiSummary.scanned}, matched {aiSummary.matched}, skipped {aiSummary.skipped}.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>OpenAI Vision Enrichment</CardTitle>
          <CardDescription>Use auction images and OpenAI vision matching on selected rows.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={handleRunVision} disabled={visionPending || selectedAiAuctionIds.length === 0}>
            {visionPending ? 'Running vision match...' : `Run OpenAI Vision (${selectedAiAuctionIds.length} selected)`}
          </Button>
          {visionSummary ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Last run: scanned {visionSummary.scanned}, matched {visionSummary.matched}, linked {visionSummary.linked}, skipped {visionSummary.skipped}.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {enrichLogs.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Enrichment Logs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-64 space-y-2 overflow-auto rounded-md border p-3 font-mono text-xs">
              {enrichLogs.slice(0, 100).map((log, idx) => (
                <p key={`${log.itemId}-${log.stage}-${idx}`}>
                  [{log.stage}] #{log.itemId}: {log.message}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Unlinked Auctions Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Unlinked Auctions ({totalUnlinkedVisible.toLocaleString()})</CardTitle>
            <div className="flex items-center gap-4">
               <Label className="text-xs uppercase">Language</Label>
               <select 
                className="rounded border p-1 text-sm dark:bg-slate-900"
                value={languageFilter}
                onChange={(e) => setLanguageFilter(e.target.value)}
               >
                 <option value="all">All</option>
                 {languageOptions.map(l => <option key={l} value={l}>{l}</option>)}
               </select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-4">
            {diagnosticFilterOptions.map(opt => (
              <Badge 
                key={opt} 
                variant={selectedDiagnosticFilters.includes(opt) ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => toggleDiagnosticFilter(opt)}
              >
                {opt}
              </Badge>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <input 
                      type="checkbox" 
                      checked={allPageSelected} 
                      onChange={() => {
                        if (allPageSelected) setSelectedAiAuctionIds(prev => prev.filter(id => !visiblePageIds.includes(id)))
                        else setSelectedAiAuctionIds(prev => Array.from(new Set([...prev, ...visiblePageIds])))
                      }}
                    />
                  </TableHead>
                  <TableHead>Auction Title</TableHead>
                  <TableHead>Language</TableHead>
                  <TableHead>Detected Set</TableHead>
                  <TableHead>Diagnostics</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unlinkedLoading ? (
                  <TableRow><TableCell colSpan={6} className="h-32 text-center"><Loader2 className="mx-auto animate-spin" /></TableCell></TableRow>
                ) : unlinkedAuctions.length ? (
                  unlinkedAuctions.map(a => (
                    <TableRow key={a.itemId}>
                      <TableCell>
                        <input 
                          type="checkbox" 
                          checked={selectedAiSet.has(a.itemId)}
                          onChange={() => toggleAiSelection(a.itemId)}
                        />
                      </TableCell>
                      <TableCell className="max-w-xs truncate font-medium">{a.title}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{a.pokemonLanguage || "Unknown"}</Badge>
                      </TableCell>
                      <TableCell className="text-slate-500">{formatDetectedExpansion(a)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {buildDiagnostics(a).map(d => <Badge key={d} variant="secondary" className="text-[10px]">{d}</Badge>)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => { setSelectedAuction(a); setSearchOpen(true); }}>
                          Link Manually
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow><TableCell colSpan={6} className="text-center text-slate-500">No unlinked auctions found.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          
          <div className="flex items-center justify-between pt-4">
            <p className="text-xs text-slate-500">Page {unlinkedPage} of {totalUnlinkedPages}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={unlinkedPage === 1} onClick={() => setUnlinkedPage(p => p - 1)}>Prev</Button>
              <Button size="sm" variant="outline" disabled={unlinkedPage >= totalUnlinkedPages} onClick={() => setUnlinkedPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Linked auctions</CardTitle>
          <CardDescription>Compact table for reviewing links and unlinking incorrect matches.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Auction</TableHead>
                  <TableHead>Cards</TableHead>
                  <TableHead>Set</TableHead>
                  <TableHead>Language</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Linked at</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linksLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center">
                      <Loader2 className="mx-auto animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : linkData?.length ? (
                  linkData.map((link) => (
                    <TableRow key={link.itemId}>
                      <TableCell className="max-w-xs truncate">{link.auctionTitle || `Item #${link.itemId}`}</TableCell>
                      <TableCell>
                        {link.cardId ? (
                          <Link className="text-sky-600 hover:underline dark:text-sky-400" to={`/cards/${link.cardId}`}>
                            {formatCardLabel(link)}
                          </Link>
                        ) : (
                          formatCardLabel(link)
                        )}
                      </TableCell>
                      <TableCell>{formatSetLabel(link)}</TableCell>
                      <TableCell>
                        {isLanguageMismatch(link.auctionLanguage, link.cardLanguage) ? (
                          <Badge variant="warning">Mismatch: {link.auctionLanguage || 'Unknown'} vs {link.cardLanguage || 'Unknown'}</Badge>
                        ) : (
                          <Badge variant="outline">{link.auctionLanguage || link.cardLanguage || 'Unknown'}</Badge>
                        )}
                      </TableCell>
                      <TableCell>{formatConfidence(link.confidence)}</TableCell>
                      <TableCell>{formatLinkedAtCompact(link.linkedAt)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => handleUnlink(link.itemId)}>
                          Unlink
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-slate-500">
                      No linked auctions yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Manual Search Dialog */}
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Link Auction</DialogTitle>
            <DialogDescription>Search for the correct card to link to item #{selectedAuction?.itemId}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input
              placeholder="Search card name or set..." 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
              onKeyDown={(e) => e.key === 'Enter' && setSearchQuery(searchTerm)}
            />
            <Button className="w-full" onClick={() => setSearchQuery(searchTerm)}>Search Cards</Button>
            {searchPending ? <p className="text-sm text-slate-500">Searching…</p> : null}
            {searchResults.length ? (
              <div className="max-h-64 space-y-2 overflow-auto rounded border p-2">
                {searchResults.map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    className="w-full rounded border px-2 py-1 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-900"
                    onClick={() => handleManualLink(card.id)}
                    disabled={manualLinkPending}
                  >
                    {card.name ?? 'Unnamed card'} {card.cardNumber ? `• ${card.cardNumber}` : ''} {card.setName ? `• ${card.setName}` : ''}
                  </button>
                ))}
              </div>
            ) : searchQuery ? (
              <p className="text-sm text-slate-500">No cards found.</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSearchOpen(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
