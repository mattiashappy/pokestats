const { parseAuctionTitle } = require('./traderaParser')

function clampLimit(limit, fallback = 500) {
  const numeric = Number(limit)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(Math.max(numeric, 1), 5000)
}

function addExample(list, entry, max = 5) {
  if (list.length >= max) return
  list.push(entry)
}

async function parseAuctions({ client, limit } = {}) {
  const hasLimit = typeof limit === 'number' && Number.isFinite(limit)
  const safeLimit = hasLimit ? clampLimit(limit) : null
  const linkColumns = await resolveLinkColumns(client)
  const auctionColumns = await resolveAuctionColumns(client, linkColumns)
  const limitClause = safeLimit ? 'LIMIT $1' : ''
  const params = safeLimit ? [safeLimit] : []
  const { rows } = await client.query(
    `
      SELECT a.${auctionColumns.itemIdColumn} AS item_id, a.title, a.description
      FROM public.tradera_auctions a
      LEFT JOIN public.tradera_auction_pt_card_links l
        ON l.${linkColumns.itemColumn} = a.${auctionColumns.keyColumn}
      WHERE l.${linkColumns.itemColumn} IS NULL
      ORDER BY a.updated_at DESC NULLS LAST, a.${auctionColumns.itemIdColumn} DESC
      ${limitClause}
    `,
    params
  )

  const summary = {
    total: rows.length,
    withCollectorKey: 0,
    withSetHints: 0,
    bundles: 0,
    examples: {
      collectorKey: [],
      setHints: [],
      bundles: [],
      skipReasons: []
    }
  }

  for (const row of rows) {
    const parsed = parseAuctionTitle(`${row.title ?? ''}\n${row.description ?? ''}`)

    if (parsed.collectorKey) {
      summary.withCollectorKey += 1
      addExample(summary.examples.collectorKey, {
        itemId: row.item_id,
        title: row.title ?? null
      })
    }

    if (parsed.setHint) {
      summary.withSetHints += 1
      addExample(summary.examples.setHints, {
        itemId: row.item_id,
        title: row.title ?? null,
        setHint: parsed.setHint
      })
    }

    if (parsed.isBundle) {
      summary.bundles += 1
      addExample(summary.examples.bundles, {
        itemId: row.item_id,
        title: row.title ?? null
      })
    }

    if (parsed.skipReason) {
      addExample(summary.examples.skipReasons, {
        itemId: row.item_id,
        title: row.title ?? null,
        skipReason: parsed.skipReason
      })
    }
  }

  return summary
}

function normalizeSetHint(setHint) {
  if (!setHint) return null
  return String(setHint).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function normalizeCollectorPart(value) {
  if (!value) return null
  return String(value).replace(/^0+(?=\d)/, '')
}

function buildCollectorNumberCandidates(collectorKey) {
  if (!collectorKey) return []
  const candidates = new Set()
  if (collectorKey.number) {
    const normalizedNumber = normalizeCollectorPart(collectorKey.number)
    if (normalizedNumber) candidates.add(normalizedNumber)
    if (collectorKey.prefix) {
      candidates.add(`${collectorKey.prefix}${normalizedNumber}`)
    }
  }
  if (collectorKey.value && !collectorKey.value.includes('/')) {
    candidates.add(normalizeCollectorPart(collectorKey.value))
  }
  return Array.from(candidates).filter(Boolean)
}

async function findSet(client, setHint) {
  const normalizedHint = normalizeSetHint(setHint)
  const hint = normalizedHint || setHint
  if (!hint) return null

  let { rows } = await client.query(
    `
      SELECT pt_set_id, name, series, card_count
      FROM public.pt_sets
      WHERE pt_set_id = $1
         OR tcgplayer_set_id = $1
         OR UPPER(name) = UPPER($1)
      LIMIT 2
    `,
    [hint]
  )

  if (rows.length === 1) return rows[0]
  if (rows.length > 1) return null

  ;({ rows } = await client.query(
    `
      SELECT pt_set_id, name, series, card_count
      FROM public.pt_sets
      WHERE name ILIKE $1
         OR series ILIKE $1
      LIMIT 2
    `,
    [hint]
  ))

  if (rows.length === 1) return rows[0]
  if (rows.length > 1) return null

  ;({ rows } = await client.query(
    `
      SELECT pt_set_id, name, series, card_count
      FROM public.pt_sets
      WHERE name ILIKE $1
         OR series ILIKE $1
         OR pt_set_id ILIKE $1
      LIMIT 2
    `,
    [`%${hint}%`]
  ))

  return rows.length === 1 ? rows[0] : null
}

async function findCardInSet(client, ptSetId, collectorKey) {
  const candidates = buildCollectorNumberCandidates(collectorKey)
  if (!candidates.length) return null

  const { rows } = await client.query(
    `
      SELECT pt_card_id, name, card_number, total_set_number
      FROM public.pt_cards
      WHERE pt_set_id = $1
        AND (
          card_number = ANY($2)
          OR regexp_replace(card_number, '^0+(?=\\d)', '') = ANY($2)
        )
      LIMIT 3
    `,
    [ptSetId, candidates]
  )

  if (rows.length !== 1) return null
  return rows[0]
}

async function findCardsByCollectorKey(client, collectorKey) {
  const candidates = buildCollectorNumberCandidates(collectorKey)
  if (!candidates.length) return []

  const { rows } = await client.query(
    `
      SELECT c.pt_card_id,
             c.name,
             c.pt_set_id,
             c.card_number,
             c.total_set_number,
             COALESCE(s.name, c.set_name) AS set_name
      FROM public.pt_cards c
      LEFT JOIN public.pt_sets s ON s.pt_set_id = c.pt_set_id
      WHERE c.card_number = ANY($1)
         OR regexp_replace(c.card_number, '^0+(?=\\d)', '') = ANY($1)
      LIMIT 4
    `,
    [candidates]
  )

  return rows
}

async function findCardsByCollectorKeyAndName(client, collectorKey, namePrefix) {
  const candidates = buildCollectorNumberCandidates(collectorKey)
  if (!candidates.length) return []

  const { rows } = await client.query(
    `
      SELECT c.pt_card_id,
             c.name,
             c.pt_set_id,
             c.card_number,
             c.total_set_number,
             COALESCE(s.name, c.set_name) AS set_name
      FROM public.pt_cards c
      LEFT JOIN public.pt_sets s ON s.pt_set_id = c.pt_set_id
      WHERE (c.card_number = ANY($1)
          OR regexp_replace(c.card_number, '^0+(?=\\d)', '') = ANY($1))
        AND c.name ILIKE $2
      LIMIT 4
    `,
    [candidates, namePrefix]
  )

  return rows
}

function buildNamePrefix(title) {
  const cleaned = String(title || '')
  const withoutCollectorKey = cleaned
    .replace(/\b([A-Za-z]{1,3})?\s*\d{1,3}\s*\/\s*\d{1,3}\b/gi, ' ')
    .replace(/(?:#|no\.?\s*)\d{1,4}\b/gi, ' ')
  const normalized = withoutCollectorKey.replace(/[^a-zA-Z0-9\s]/g, ' ').toLowerCase()
  const tokens = normalized.split(/\s+/).filter(Boolean)
  const filtered = tokens.filter(
    (token) =>
      !/^(ex|v|vmax|vstar|gx)$/.test(token) &&
      !['pokemon', 'pokémon', 'pokemonkort', 'pokémonkort', 'kort', 'card', 'cards'].includes(token)
  )

  if (!filtered.length) return null
  return `${filtered[0]}%`
}

async function findUniqueCardByCollectorKey(client, collectorKey, title) {
  let rows = await findCardsByCollectorKey(client, collectorKey)
  if (rows.length === 1) return rows[0]
  if (!rows.length) return null

  const namePrefix = buildNamePrefix(title)
  if (!namePrefix) return null

  rows = await findCardsByCollectorKeyAndName(client, collectorKey, namePrefix)
  if (rows.length === 1) return rows[0]
  return null
}

function incrementSkip(skipReasons, reason) {
  skipReasons[reason] = (skipReasons[reason] || 0) + 1
}

function addSkipExample(skipExamples, reason, entry, max = 2000) {
  if (!skipExamples[reason]) skipExamples[reason] = []
  if (skipExamples[reason].length >= max) return
  skipExamples[reason].push(entry)
}

function shouldValidateSetTotal(collectorKey) {
  if (!collectorKey || !collectorKey.total) return false
  if (collectorKey.kind === 'TG' || collectorKey.kind === 'GG') return false
  return !collectorKey.prefix
}

function isSetTotalMatch(collectorKey, setTotal) {
  if (!shouldValidateSetTotal(collectorKey)) return true
  const expectedTotal = Number(setTotal)
  const parsedTotal = Number(collectorKey.total)
  if (!Number.isFinite(expectedTotal) || !Number.isFinite(parsedTotal)) return true
  return expectedTotal === parsedTotal
}

async function resolveLinkColumns(client) {
  const { rows } = await client.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'tradera_auction_pt_card_links'
    `
  )

  const columnNames = new Set(rows.map((row) => row.column_name))
  const itemColumn = columnNames.has('item_id') ? 'item_id' : columnNames.has('auction_id') ? 'auction_id' : null

  if (!itemColumn) {
    throw new Error('tradera_auction_pt_card_links is missing item_id/auction_id column')
  }

  const timestampColumn = columnNames.has('matched_at')
    ? 'matched_at'
    : columnNames.has('linked_at')
      ? 'linked_at'
      : columnNames.has('created_at')
        ? 'created_at'
        : null

  const cardColumn = columnNames.has('pt_card_id') ? 'pt_card_id' : columnNames.has('card_id') ? 'card_id' : null

  if (!cardColumn) {
    throw new Error('tradera_auction_pt_card_links is missing pt_card_id/card_id column')
  }

  const methodColumn = columnNames.has('match_method') ? 'match_method' : columnNames.has('method') ? 'method' : null
  const confidenceColumn = columnNames.has('confidence_score')
    ? 'confidence_score'
    : columnNames.has('confidence')
      ? 'confidence'
      : null
  const statusColumn = columnNames.has('status') ? 'status' : null

  return {
    itemColumn,
    timestampColumn,
    cardColumn,
    methodColumn,
    confidenceColumn,
    statusColumn
  }
}

async function resolveAuctionColumns(client, linkColumns) {
  const { rows } = await client.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'tradera_auctions'
    `
  )

  const columnNames = new Set(rows.map((row) => row.column_name))
  const keyColumn =
    (linkColumns?.itemColumn && columnNames.has(linkColumns.itemColumn) && linkColumns.itemColumn) ||
    (columnNames.has('item_id') && 'item_id') ||
    (columnNames.has('auction_id') && 'auction_id') ||
    (columnNames.has('id') && 'id') ||
    null

  if (!keyColumn) {
    throw new Error('tradera_auctions is missing an id/auction_id/item_id column')
  }

  const itemIdColumn = columnNames.has('item_id') ? 'item_id' : keyColumn

  return {
    keyColumn,
    itemIdColumn
  }
}

async function linkAuctions({ client, limit } = {}) {
  const hasLimit = typeof limit === 'number' && Number.isFinite(limit)
  const safeLimit = hasLimit ? clampLimit(limit) : null
  const linkColumns = await resolveLinkColumns(client)
  const auctionColumns = await resolveAuctionColumns(client, linkColumns)
  const limitClause = safeLimit ? 'LIMIT $1' : ''
  const params = safeLimit ? [safeLimit] : []
  const { rows } = await client.query(
    `
      SELECT a.${auctionColumns.keyColumn} AS auction_key,
             a.${auctionColumns.itemIdColumn} AS item_id,
             a.title,
             a.description
      FROM public.tradera_auctions a
      LEFT JOIN public.tradera_auction_pt_card_links l
        ON l.${linkColumns.itemColumn} = a.${auctionColumns.keyColumn}
      WHERE l.${linkColumns.itemColumn} IS NULL
      ORDER BY a.updated_at DESC NULLS LAST, a.${auctionColumns.itemIdColumn} DESC
      ${limitClause}
    `,
    params
  )

  const summary = {
    scanned: rows.length,
    linked: 0,
    skipped: 0,
    skipReasons: {},
    skippedExamples: {},
    linkedExamples: []
  }

  for (const row of rows) {
    const parsed = parseAuctionTitle(`${row.title ?? ''}\n${row.description ?? ''}`)

    if (parsed.skipReason) {
      summary.skipped += 1
      incrementSkip(summary.skipReasons, parsed.skipReason)
      addSkipExample(summary.skippedExamples, parsed.skipReason, {
        itemId: row.item_id,
        title: row.title ?? null
      })
      continue
    }

    if (!parsed.collectorKey) {
      summary.skipped += 1
      incrementSkip(summary.skipReasons, 'missing_collector_key')
      addSkipExample(summary.skippedExamples, 'missing_collector_key', {
        itemId: row.item_id,
        title: row.title ?? null
      })
      continue
    }

    let card = null
    let set = null

    if (!parsed.setHint) {
      card = await findUniqueCardByCollectorKey(client, parsed.collectorKey, row.title ?? '')
      if (!card) {
        summary.skipped += 1
        incrementSkip(summary.skipReasons, 'missing_set_hint')
        addSkipExample(summary.skippedExamples, 'missing_set_hint', {
          itemId: row.item_id,
          title: row.title ?? null
        })
        continue
      }
    } else {
      set = await findSet(client, parsed.setHint)
      if (!set) {
        summary.skipped += 1
        incrementSkip(summary.skipReasons, 'expansion_not_unique')
        addSkipExample(summary.skippedExamples, 'expansion_not_unique', {
          itemId: row.item_id,
          title: row.title ?? null
        })
        continue
      }

      if (!isSetTotalMatch(parsed.collectorKey, set.card_count)) {
        summary.skipped += 1
        incrementSkip(summary.skipReasons, 'set_total_mismatch')
        addSkipExample(summary.skippedExamples, 'set_total_mismatch', {
          itemId: row.item_id,
          title: row.title ?? null
        })
        continue
      }

      card = await findCardInSet(client, set.pt_set_id, parsed.collectorKey)
      if (!card) {
        summary.skipped += 1
        incrementSkip(summary.skipReasons, 'card_not_unique')
        addSkipExample(summary.skippedExamples, 'card_not_unique', {
          itemId: row.item_id,
          title: row.title ?? null
        })
        continue
      }
    }

    const linkKeyValue = row.auction_key
    const insertColumns = [linkColumns.itemColumn, linkColumns.cardColumn]
    const insertValues = ['$1', '$2']
    const params = [linkKeyValue, card.pt_card_id]

    if (linkColumns.timestampColumn) {
      insertColumns.push(linkColumns.timestampColumn)
      insertValues.push('NOW()')
    }

    if (linkColumns.methodColumn) {
      insertColumns.push(linkColumns.methodColumn)
      params.push('deterministic')
      insertValues.push(`$${params.length}`)
    }

    if (linkColumns.confidenceColumn) {
      insertColumns.push(linkColumns.confidenceColumn)
      params.push(1)
      insertValues.push(`$${params.length}`)
    }

    if (linkColumns.statusColumn) {
      insertColumns.push(linkColumns.statusColumn)
      params.push('linked')
      insertValues.push(`$${params.length}`)
    }

    const updateClauses = [`${linkColumns.cardColumn} = EXCLUDED.${linkColumns.cardColumn}`]

    if (linkColumns.timestampColumn) {
      updateClauses.push(`${linkColumns.timestampColumn} = NOW()`)
    }

    if (linkColumns.methodColumn) {
      updateClauses.push(`${linkColumns.methodColumn} = EXCLUDED.${linkColumns.methodColumn}`)
    }

    if (linkColumns.confidenceColumn) {
      updateClauses.push(`${linkColumns.confidenceColumn} = EXCLUDED.${linkColumns.confidenceColumn}`)
    }

    if (linkColumns.statusColumn) {
      updateClauses.push(`${linkColumns.statusColumn} = EXCLUDED.${linkColumns.statusColumn}`)
    }

    await client.query(
      `
        INSERT INTO public.tradera_auction_pt_card_links (${insertColumns.join(', ')})
        VALUES (${insertValues.join(', ')})
        ON CONFLICT (${linkColumns.itemColumn}) DO UPDATE SET
          ${updateClauses.join(',\n          ')}
      `,
      params
    )

    summary.linked += 1
    if (summary.linkedExamples.length < 20) {
      summary.linkedExamples.push({
        itemId: row.item_id,
        title: row.title ?? null,
        cardId: card.pt_card_id,
        cardName: card.name ?? null,
        setName: set?.name ?? null
      })
    }
  }

  return summary
}

module.exports = { parseAuctions, linkAuctions }
