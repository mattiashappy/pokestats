const { loadCatalog } = require('./catalogLoader')

async function seedCatalog(pool) {
  if (!pool) return

  const { expansions, cardsBySetCode } = await loadCatalog()
  if (!Array.isArray(expansions) || expansions.length === 0) return

  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const expansionIdByCode = {}

    for (const expansion of expansions) {
      const result = await client.query(
        `
          INSERT INTO public.expansions (set_code, name, era, language, set_total, release_date, image_url)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (set_code) DO UPDATE SET
            name = EXCLUDED.name,
            era = EXCLUDED.era,
            language = EXCLUDED.language,
            set_total = EXCLUDED.set_total,
            release_date = EXCLUDED.release_date,
            image_url = EXCLUDED.image_url
          RETURNING id
        `,
        [
          expansion.set_code,
          expansion.name ?? null,
          expansion.era ?? null,
          expansion.language ?? null,
          expansion.set_total ?? null,
          expansion.release_date ?? null,
          expansion.image_url ?? null
        ]
      )

      expansionIdByCode[expansion.set_code] = result.rows[0].id
    }

    for (const expansion of expansions) {
      const cards = cardsBySetCode[expansion.set_code]?.cards ?? []
      if (cards.length === 0) continue

      const values = []
      const params = []
      let index = 1

      for (const card of cards) {
        values.push(`($${index++}, $${index++}, $${index++}, $${index++}, $${index++}, $${index++}, $${index++})`)
        params.push(
          card.name,
          expansion.era ?? null,
          expansion.name ?? expansion.set_code,
          expansion.set_code,
          expansion.set_total ?? cardsBySetCode[expansion.set_code]?.set_total ?? null,
          card.card_number,
          expansionIdByCode[expansion.set_code]
        )
      }

      await client.query(
        `
          INSERT INTO public.cards (name, era, set_name, set_code, set_total, card_number, expansion_id)
          VALUES ${values.join(',')}
          ON CONFLICT (expansion_id, card_number)
            WHERE expansion_id IS NOT NULL AND card_number IS NOT NULL
            DO UPDATE SET
              name = EXCLUDED.name,
              era = EXCLUDED.era,
              set_name = EXCLUDED.set_name,
              set_code = EXCLUDED.set_code,
              set_total = EXCLUDED.set_total
        `,
        params
      )
    }

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

module.exports = { seedCatalog }
