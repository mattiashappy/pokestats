# Database contract (pokestats)

## Core principle

Truth of link state lives in `auctions.card_id`.

- `card_id IS NULL` → unlinked auction
- `card_id IS NOT NULL` → linked auction

## Tables

### `cards` (catalog)
Purpose: canonical card metadata.

Columns:

- `id SERIAL PRIMARY KEY`
- `name TEXT NOT NULL`
- `era TEXT NULL`
- `set_name TEXT NOT NULL`
- `set_code TEXT NOT NULL`
- `set_total INT NULL`
- `card_number TEXT NOT NULL`
- `source TEXT DEFAULT 'catalog'`
- `image_url TEXT NULL`
- `product_details TEXT NULL`
- `expansion_id INT NULL REFERENCES expansions(id)`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Constraints and indexes:

- Unique pairs on `(expansion_id, card_number)` and `(set_code, card_number)` (plus partial unique indexes to enforce the same when values are present)
- `idx_cards_set_code`, `idx_cards_card_number`, `idx_cards_name`, `idx_cards_set_name`, `idx_cards_set_cardnumber`
- `cards_no_unknown_placeholders` prevents `set_name`, `card_number`, and `set_code` from being `unknown` / `unknown-*`

Write rules:

- Importers/catalog syncs own writes; app treats this as read-mostly metadata.

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
- `parsed_set_code TEXT NULL`
- `raw JSONB NULL` (misc extra payload; do not add columns unless truly needed)
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Indexes:

- PK on `item_id`
- `idx_auctions_card_id (card_id)`
- `idx_auctions_end_date_desc (end_date DESC)`
- `idx_auctions_updated_at_desc (updated_at DESC)`
- `idx_auctions_unlinked_end_date (end_date DESC) WHERE card_id IS NULL`
- `idx_auctions_unlinked_recent (end_date DESC) WHERE card_id IS NULL`

Write rules:

- Importer upserts into `auctions` by `item_id`.
- Linking sets `auctions.card_id` and updates `updated_at`.

## Operational notes

- Keep `auctions` minimal: aside from `parsed_set_code`, avoid new parsed/debug columns and prefer `raw`.
- The `cards` catalog rejects placeholder values: `set_name`, `card_number`, and `set_code` cannot be `unknown` / `unknown-*`.

## Queries the app relies on

- Fetch recent unlinked: `SELECT * FROM auctions WHERE card_id IS NULL ORDER BY end_date DESC LIMIT $1;`
- Fetch linked card auctions: `SELECT * FROM auctions WHERE card_id = $1 ORDER BY end_date DESC;`
## Migration policy

Any schema change must update both `schema.sql` and `DATABASE_CONTRACT.md`. Keep `auctions` minimal; prefer `raw` over adding new columns unless absolutely necessary.
