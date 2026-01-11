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
  const safeLimit = clampLimit(limit)
  const { rows } = await client.query(
    `
      SELECT item_id, title, description
      FROM public.tradera_auctions
      ORDER BY updated_at DESC NULLS LAST, item_id DESC
      LIMIT $1
    `,
    [safeLimit]
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

async function findExpansion(client, setHint) {
  let { rows } = await client.query(
    `
      SELECT id, set_name, set_code, set_total
      FROM public.expansions
      WHERE UPPER(set_code) = UPPER($1)
      LIMIT 2
    `,
    [setHint]
  )

  if (rows.length === 1) return rows[0]
  if (rows.length > 1) return null

  ;({ rows } = await client.query(
    `
      SELECT id, set_name, set_code, set_total
      FROM public.expansions
      WHERE set_name ILIKE $1
      LIMIT 2
    `,
    [setHint]
  ))

  if (rows.length === 1) return rows[0]
  if (rows.length > 1) return null

  ;({ rows } = await client.query(
    `
      SELECT id, set_name, set_code, set_total
      FROM public.expansions
      WHERE set_name ILIKE $1 OR set_code ILIKE $1
      LIMIT 2
    `,
    [`%${setHint}%`]
  ))

  return rows.length === 1 ? rows[0] : null
}

async function findCard(client, expansionId, collectorKey) {
  const { rows } = await client.query(
    `
      SELECT id, name
      FROM public.cards
      WHERE expansion_id = $1
        AND (collector_key = $2 OR collector_number_raw = $2)
      LIMIT 2
    `,
    [expansionId, collectorKey]
  )

  if (rows.length !== 1) return null
  return rows[0]
}

async function findCardsByCollectorKey(client, collectorKey) {
  const { rows } = await client.query(
    `
      SELECT id, name, expansion_id
      FROM public.cards
      WHERE collector_key = $1
      LIMIT 3
    `,
    [collectorKey]
  )

  return rows
}

async function findCardsByCollectorKeyAndName(client, collectorKey, namePrefix) {
  const { rows } = await client.query(
    `
      SELECT id, name, expansion_id
      FROM public.cards
      WHERE collector_key = $1
        AND name ILIKE $2
      LIMIT 3
    `,
    [collectorKey, namePrefix]
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

function shouldValidateSetTotal(collectorKey) {
  if (!collectorKey || !collectorKey.total) return false
  if (collectorKey.kind === 'TG' || collectorKey.kind === 'GG') return false
  return !collectorKey.prefix
}

function isSetTotalMatch(collectorKey, expansion) {
  if (!shouldValidateSetTotal(collectorKey)) return true
  const expectedTotal = Number(expansion.set_total)
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
        AND table_name = 'tradera_auction_card_links'
    `
  )

  const columnNames = new Set(rows.map((row) => row.column_name))
  const itemColumn = columnNames.has('item_id') ? 'item_id' : columnNames.has('auction_id') ? 'auction_id' : null

  if (!itemColumn) {
    throw new Error('tradera_auction_card_links is missing item_id/auction_id column')
  }

  const timestampColumn = columnNames.has('linked_at') ? 'linked_at' : columnNames.has('created_at') ? 'created_at' : null

  return {
    itemColumn,
    timestampColumn,
    hasMethod: columnNames.has('method'),
    hasStatus: columnNames.has('status')
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
  const safeLimit = clampLimit(limit)
  const linkColumns = await resolveLinkColumns(client)
  const auctionColumns = await resolveAuctionColumns(client, linkColumns)
  const { rows } = await client.query(
    `
      SELECT a.${auctionColumns.keyColumn} AS auction_key,
             a.${auctionColumns.itemIdColumn} AS item_id,
             a.title,
             a.description
      FROM public.tradera_auctions a
      LEFT JOIN public.tradera_auction_card_links l
        ON l.${linkColumns.itemColumn} = a.${auctionColumns.keyColumn}
      WHERE l.${linkColumns.itemColumn} IS NULL
      ORDER BY a.updated_at DESC NULLS LAST, a.${auctionColumns.itemIdColumn} DESC
      LIMIT $1
    `,
    [safeLimit]
  )

  const summary = {
    scanned: rows.length,
    linked: 0,
    skipped: 0,
    skipReasons: {},
    linkedExamples: []
  }

  for (const row of rows) {
    const parsed = parseAuctionTitle(`${row.title ?? ''}\n${row.description ?? ''}`)

    if (parsed.skipReason) {
      summary.skipped += 1
      incrementSkip(summary.skipReasons, parsed.skipReason)
      continue
    }

    if (!parsed.collectorKey) {
      summary.skipped += 1
      incrementSkip(summary.skipReasons, 'missing_collector_key')
      continue
    }

    let card = null
    let expansion = null

    if (!parsed.setHint) {
      card = await findUniqueCardByCollectorKey(client, parsed.collectorKey.value, row.title ?? '')
      if (!card) {
        summary.skipped += 1
        incrementSkip(summary.skipReasons, 'missing_set_hint')
        continue
      }
    } else {
      expansion = await findExpansion(client, parsed.setHint)
      if (!expansion) {
        summary.skipped += 1
        incrementSkip(summary.skipReasons, 'expansion_not_unique')
        continue
      }

      if (!isSetTotalMatch(parsed.collectorKey, expansion)) {
        summary.skipped += 1
        incrementSkip(summary.skipReasons, 'set_total_mismatch')
        continue
      }

      card = await findCard(client, expansion.id, parsed.collectorKey.value)
      if (!card) {
        summary.skipped += 1
        incrementSkip(summary.skipReasons, 'card_not_unique')
        continue
      }
    }

    const linkKeyValue = row.auction_key
    const insertColumns = [linkColumns.itemColumn, 'card_id']
    const insertValues = ['$1', '$2']
    const params = [linkKeyValue, card.id]

    if (linkColumns.timestampColumn) {
      insertColumns.push(linkColumns.timestampColumn)
      insertValues.push('NOW()')
    }

    if (linkColumns.hasMethod) {
      insertColumns.push('method')
      params.push('deterministic')
      insertValues.push(`$${params.length}`)
    }

    if (linkColumns.hasStatus) {
      insertColumns.push('status')
      params.push('linked')
      insertValues.push(`$${params.length}`)
    }

    const updateClauses = ['card_id = EXCLUDED.card_id']

    if (linkColumns.timestampColumn) {
      updateClauses.push(`${linkColumns.timestampColumn} = NOW()`)
    }

    if (linkColumns.hasMethod) {
      updateClauses.push('method = EXCLUDED.method')
    }

    if (linkColumns.hasStatus) {
      updateClauses.push('status = EXCLUDED.status')
    }

    await client.query(
      `
        INSERT INTO public.tradera_auction_card_links (${insertColumns.join(', ')})
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
        cardId: card.id,
        cardName: card.name ?? null,
        setName: expansion?.set_name ?? null
      })
    }
  }

  return summary
}

module.exports = { parseAuctions, linkAuctions }
