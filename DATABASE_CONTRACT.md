# Database contract (pokestats)

## Core principle

Raw Tradera imports live in `tradera_auctions`. Linking happens separately in `tradera_auction_card_links`.

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

### `tradera_auctions` (source of truth)
Purpose: store raw auction records; minimal stable schema.

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
- `tradera_attributes JSONB NULL`
- `image_urls JSONB NULL`
- `description TEXT NULL`
- `item_condition TEXT NULL`
- `pokemon_era TEXT NULL`
- `pokemon_language TEXT NULL`
- `raw JSONB NULL` (full payload; prefer `raw` over new columns unless absolutely necessary)
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Indexes:

- PK on `item_id`
- `idx_tradera_auctions_end_date_desc (end_date DESC)`
- `idx_tradera_auctions_pokemon_era (pokemon_era)`
- `idx_tradera_auctions_language (pokemon_language)`

Write rules:

- Importer upserts into `tradera_auctions` by `item_id`.
- `updated_at` is set on every import upsert.

### `tradera_auction_card_links` (linking table)
Purpose: track the relationship between raw auctions and catalog cards.

Columns:

- `item_id BIGINT PRIMARY KEY REFERENCES tradera_auctions(item_id)`
- `card_id INT NOT NULL REFERENCES cards(id)`
- `linked_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `method TEXT NULL`
- `confidence_score INT NULL`
- `status TEXT NOT NULL DEFAULT 'linked'`

Indexes:

- `idx_tradera_links_card_id (card_id)`

## Operational notes

- Keep `tradera_auctions` minimal: avoid new parsed/debug columns and prefer `raw`.
- The `cards` catalog rejects placeholder values: `set_name`, `card_number`, and `set_code` cannot be `unknown` / `unknown-*`.

## Queries the app relies on

- Fetch recent auctions: `SELECT * FROM tradera_auctions ORDER BY end_date DESC LIMIT $1;`
- Fetch linked card auctions: `SELECT a.* FROM tradera_auction_card_links l JOIN tradera_auctions a ON a.item_id = l.item_id WHERE l.card_id = $1 ORDER BY a.end_date DESC;`
## Migration policy

Any schema change must update both `schema.sql` and `DATABASE_CONTRACT.md`. Keep `tradera_auctions` minimal; prefer `raw` over adding new columns unless absolutely necessary.
