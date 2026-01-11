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
      bundles: []
    }
  }

  for (const row of rows) {
    const parsed = parseAuctionTitle(`${row.title ?? ''} ${row.description ?? ''}`)

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
  }

  return summary
}

async function findExpansion(client, setHint) {
  const { rows } = await client.query(
    `
      SELECT id, set_name
      FROM public.expansions
      WHERE set_name ILIKE $1 OR set_code ILIKE $1
      LIMIT 2
    `,
    [`%${setHint}%`]
  )

  if (rows.length !== 1) return null
  return rows[0]
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

function incrementSkip(skipReasons, reason) {
  skipReasons[reason] = (skipReasons[reason] || 0) + 1
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

async function linkAuctions({ client, limit } = {}) {
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
    scanned: rows.length,
    linked: 0,
    skipped: 0,
    skipReasons: {},
    linkedExamples: []
  }

  const linkColumns = await resolveLinkColumns(client)

  for (const row of rows) {
    const parsed = parseAuctionTitle(`${row.title ?? ''} ${row.description ?? ''}`)

    if (parsed.isBundle) {
      summary.skipped += 1
      incrementSkip(summary.skipReasons, 'bundle')
      continue
    }

    if (!parsed.collectorKey) {
      summary.skipped += 1
      incrementSkip(summary.skipReasons, 'missing_collector_key')
      continue
    }

    if (!parsed.setHint) {
      summary.skipped += 1
      incrementSkip(summary.skipReasons, 'missing_set_hint')
      continue
    }

    const expansion = await findExpansion(client, parsed.setHint)
    if (!expansion) {
      summary.skipped += 1
      incrementSkip(summary.skipReasons, 'expansion_not_unique')
      continue
    }

    const card = await findCard(client, expansion.id, parsed.collectorKey)
    if (!card) {
      summary.skipped += 1
      incrementSkip(summary.skipReasons, 'card_not_unique')
      continue
    }

    const insertColumns = [linkColumns.itemColumn, 'card_id']
    const insertValues = ['$1', '$2']
    const params = [row.item_id, card.id]

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
        setName: expansion.set_name ?? null
      })
    }
  }

  return summary
}

module.exports = { parseAuctions, linkAuctions }
