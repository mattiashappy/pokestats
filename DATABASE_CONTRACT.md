# Database contract (pokestats)

## Core principle

Truth of link state lives in `auctions.card_id`.

- `card_id IS NULL` → unlinked auction
- `card_id IS NOT NULL` → linked auction

Enrichment status is derived/computed and stored in `auction_enrichment.status`.

**Invariant:** if `auctions.card_id IS NOT NULL` then `auction_enrichment.status = 'matched'`.

## Tables

### `auctions` (source of truth)
Purpose: store auction records; minimal stable schema.

Columns:

- `item_id BIGINT PRIMARY KEY`
- `category_id INT NOT NULL`
- `end_date TIMESTAMPTZ NOT NULL`
- `price INT NULL`
- `bid_count INT NULL`
- `seller_id BIGINT NULL`
- `seller_alias TEXT NULL`
- `title TEXT NULL`
- `item_url TEXT NULL`
- `thumbnail_url TEXT NULL`
- `card_id INT NULL REFERENCES cards(id)`
- `raw JSONB NULL` (misc extra payload; do not add columns unless truly needed)
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Indexes:

- PK on `item_id`
- `idx_auctions_card_id (card_id)`
- `idx_auctions_end_date_desc (end_date DESC)`
- `idx_auctions_updated_at_desc (updated_at DESC)`
- `idx_auctions_unlinked_end_date (end_date DESC) WHERE card_id IS NULL`

Write rules:

- Importer upserts into `auctions` by `item_id`.
- Linking sets `auctions.card_id` and updates `updated_at`.

### `auction_enrichment` (computed state, can be rebuilt)
Purpose: store parsing/matching output for each auction; 1:1 with `auctions`.

Columns:

- `item_id BIGINT PRIMARY KEY REFERENCES auctions(item_id) ON DELETE CASCADE`
- `status TEXT NOT NULL DEFAULT 'unmatched'`<br>
  Values: `'unmatched' | 'needs_review' | 'matched'`
- `confidence_score INT NULL`
- `method TEXT NULL`
- `matched_set_code TEXT NULL`
- `matched_era TEXT NULL`
- `parsed_card_number TEXT NULL`
- `parsed_number_text TEXT NULL`
- `parsed_set_hint TEXT NULL`
- `suggested_cards JSONB NULL` (optional UI helper)
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Index:

- `idx_auction_enrichment_status (status)`

Write rules:

- Enrichment job upserts into `auction_enrichment` by `item_id`.
- When linking occurs, code must also set `auction_enrichment.status = 'matched'` (same transaction if possible).

## Views (read compatibility)

### `tradera_sales` (compatibility view)
Read-only. Do not write.

Definition (must match DB): joins `auctions` + `auction_enrichment` and exposes selected columns used by the app.

Columns exposed: `item_id, category_id, end_date, price, bid_count, seller_id, seller_alias, title, item_url, thumbnail_url, card_id, enrich_status, match_confidence_score, match_method, matched_set_code, matched_era, parsed_card_number, parsed_number_text, parsed_set_hint, suggested_cards, updated_at`.

### `auction_claim_queue`
Read-only. Shows only auctions where `card_id IS NULL` plus enrichment fields.

### Legacy

`tradera_sales_legacy` exists only for rollback/history and should not be used by new code.

## Operational notes

- It is safe to `TRUNCATE auction_enrichment` and rerun enrichment.
- Never reintroduce "parsed_* / debug" columns into `auctions`; use `raw` or `auction_enrichment`.
- The `cards` catalog rejects placeholder values: `set_name`, `card_number`, and `set_code` cannot be `unknown` / `unknown-*`; enrichment must never insert into `cards`.
- Before deleting catalog cards, clear any references from legacy tables like `tradera_sales_legacy` to satisfy foreign keys.

## Queries the app relies on

- Fetch recent unlinked: `SELECT * FROM auctions WHERE card_id IS NULL ORDER BY end_date DESC LIMIT $1;`
- Fetch linked card auctions: `SELECT * FROM auctions WHERE card_id = $1 ORDER BY end_date DESC;`
- Fetch claim queue: `SELECT * FROM auction_claim_queue ORDER BY end_date DESC LIMIT $1;`

## Migration policy

Any schema change must update both `schema.sql` and `DATABASE_CONTRACT.md`. Keep `auctions` minimal; prefer enrichment/table extensions over new columns unless absolutely necessary. Views must stay in sync with table changes.
