# PokéStats – Database Schema (Authoritative)

This document is the single source of truth for the PostgreSQL database.
Before writing SQL, migrations, or backend code, ALWAYS consult this file.
Do NOT assume columns or relationships not defined here.

---

## Table roles (IMPORTANT)

### Canonical / authoritative entities (use these in the app)
- `pt_sets` (canonical set/expansion)
- `pt_cards` (canonical card)

### Raw/source ingestion tables (do not use for core app logic unless necessary)
- `expansions` (raw set metadata)
- `cards` (raw card rows)

---

## Relationship map (confirmed)

- `cards.expansion_id` → `expansions.id` (ON DELETE CASCADE)
- `pt_cards.pt_set_id` → `pt_sets.pt_set_id`
- `tradera_auction_pt_card_links.pt_card_id` → `pt_cards.pt_card_id` (ON DELETE CASCADE) *(table definition pending)*

---

# RAW TABLES

## Table: expansions (RAW)

Purpose:
Raw/source set metadata. Used by `cards` via `expansion_id`.
Not the canonical set table (use `pt_sets` in the app when available).

Primary key:
- `id` (integer)

Columns:
- `id` integer NOT NULL DEFAULT nextval('expansions_id_seq'::regclass)
- `set_code` text NOT NULL  (UNIQUE)
- `set_name` text NOT NULL
- `era` text NULL
- `base_total` integer NULL
- `set_total` integer NULL
- `created_at` timestamptz NOT NULL DEFAULT now()

Indexes:
- PK: `expansions_pkey` (id)
- Unique: `expansions_set_code_key` (set_code)
- `idx_expansions_era` (era)

Referenced by:
- `cards.expansion_id` FK → `expansions.id` ON DELETE CASCADE

---

## Table: cards (RAW)

Purpose:
Raw ingested card rows. Useful for imports and debugging.
Prefer `pt_cards` for application queries and features.

Primary key:
- `id` (integer)

Columns:
- `id` integer NOT NULL DEFAULT nextval('cards_id_seq'::regclass)
- `expansion_id` integer NOT NULL
- `name` text NOT NULL
- `collector_number_raw` text NOT NULL
- `collector_key` text NULL
- `number` integer NULL
- `printed_total` integer NULL
- `is_secret` boolean NULL
- `image_url` text NULL
- `source` text NOT NULL DEFAULT 'json'::text
- `created_at` timestamptz NOT NULL DEFAULT now()

Indexes:
- PK: `cards_pkey` (id)
- `idx_cards_name` (name)
- Partial unique index on `collector_key` where not null (name/indexdef pending)

Constraints:
- `collector_number_raw` appears to be validated by a regex constraint (exact name/pattern pending from clean \d+ output)
- `number` and `printed_total` appear to be constrained to be both NULL or both NOT NULL (exact constraint name pending)

Foreign keys:
- `cards.expansion_id` FK → `expansions.id` ON DELETE CASCADE

---

# CANONICAL TABLES (USE THESE)

## Table: pt_sets (CANONICAL)

Purpose:
Canonical Pokémon set entity used throughout the app.

Primary key:
- `pt_set_id` (text)

Columns:
- `pt_set_id` text NOT NULL
- `tcgplayer_set_id` text NULL (UNIQUE)
- `name` text NOT NULL
- `series` text NULL
- `release_date` date NULL
- `card_count` integer NULL
- `image_cdn_url` text NULL
- `image_cdn_url200` text NULL
- `image_cdn_url400` text NULL
- `image_cdn_url800` text NULL
- `image_url` text NULL
- `price_guide_url` text NULL
- `has_price_guide` boolean NULL
- `no_price_guide_reason` text NULL
- `created_at` timestamptz NULL
- `updated_at` timestamptz NULL
- `language` varchar(50) NULL DEFAULT 'english'

Indexes:
- PK: `pt_sets_pkey` (pt_set_id)
- Unique: `pt_sets_tcgplayer_set_id_key` (tcgplayer_set_id)
- `idx_pt_sets_language` (language)

Referenced by:
- `pt_cards.pt_set_id` FK → `pt_sets.pt_set_id`

---

## Table: pt_cards (CANONICAL)

Purpose:
Canonical Pokémon card entity used throughout the app.

Primary key:
- `pt_card_id` (text)

Core identifiers:
- `tcgplayer_product_id` integer NULL (UNIQUE)
- `pt_set_id` text NULL (FK → pt_sets.pt_set_id)

Columns:
- `pt_card_id` text NOT NULL
- `tcgplayer_product_id` integer NULL
- `pt_set_id` text NULL
- `set_name` text NULL
- `name` text NOT NULL
- `card_number` text NULL
- `total_set_number` text NULL
- `rarity` text NULL
- `card_type` text NULL
- `hp` integer NULL
- `stage` text NULL
- `artist` text NULL
- `tcgplayer_url` text NULL
- `image_cdn_url` text NULL
- `image_cdn_url200` text NULL
- `image_cdn_url400` text NULL
- `image_cdn_url800` text NULL

Pricing (authoritative):
- `price_market` numeric NULL
- `price_listings` numeric NULL
- `price_primary_condition` text NULL
- `price_primary_printing` text NULL
- `price_last_updated` timestamptz NULL
- `prices_data` jsonb NULL DEFAULT '{}'::jsonb

Other:
- `updated_at` timestamptz NULL DEFAULT now()
- `language` varchar(50) NULL DEFAULT 'english'
- `pokemon_type` text NULL
- `energy_type` text[] NULL
- `flavor_text` text NULL

Indexes:
- PK: `pt_cards_pkey` (pt_card_id)
- Unique: `pt_cards_tcgplayer_product_id_key` (tcgplayer_product_id)
- `idx_pt_cards_language` (language)
- `pt_cards_card_number_idx` (card_number)
- `pt_cards_name_idx` (name)
- `pt_cards_pt_set_id_idx` (pt_set_id)
- `pt_cards_set_name_card_number_idx` (set_name, card_number)

Foreign keys:
- `pt_cards.pt_set_id` FK → `pt_sets.pt_set_id`

Referenced by:
- `tradera_auction_pt_card_links.pt_card_id` FK → `pt_cards.pt_card_id` ON DELETE CASCADE *(table definition pending)*

---

## Global pricing rules (Codex MUST obey)

- For canonical card prices, always use `pt_cards.price_market` (and related pricing fields).
- Do NOT calculate “market price” on the frontend.
- Do NOT infer pricing from auctions unless explicitly asked for auction analytics.
