-- Canonical expansions table used by catalog + cards FK.
CREATE TABLE IF NOT EXISTS expansions (
    id SERIAL PRIMARY KEY,
    set_code TEXT NOT NULL UNIQUE,
    name TEXT,
    era TEXT,
    language TEXT DEFAULT 'EN',
    set_total INTEGER,
    release_date DATE,
    image_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expansions_era ON expansions (era);

-- Core cards table kept for compatibility with import scripts.
CREATE TABLE IF NOT EXISTS cards (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    era TEXT,
    set_name TEXT NOT NULL,
    set_code TEXT NOT NULL,
    set_total INTEGER,
    card_number TEXT NOT NULL,
    source TEXT DEFAULT 'catalog',
    image_url TEXT,
    product_details TEXT,
    expansion_id INTEGER REFERENCES public.expansions(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT cards_expansion_card_number_key UNIQUE (expansion_id, card_number),
    CONSTRAINT cards_unique_set_code_number UNIQUE (set_code, card_number)
);

CREATE INDEX IF NOT EXISTS idx_cards_set_code ON cards (set_code);
CREATE INDEX IF NOT EXISTS idx_cards_card_number ON cards (card_number);
CREATE INDEX IF NOT EXISTS idx_cards_name ON cards (name);
CREATE INDEX IF NOT EXISTS idx_cards_set_name ON cards (set_name);
CREATE INDEX IF NOT EXISTS idx_cards_set_cardnumber ON cards (set_name, card_number);

CREATE UNIQUE INDEX IF NOT EXISTS cards_unique_expansion_number
    ON cards (expansion_id, card_number)
    WHERE expansion_id IS NOT NULL AND card_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS cards_unique_setcode_number
    ON cards (set_code, card_number)
    WHERE set_code IS NOT NULL AND card_number IS NOT NULL;

ALTER TABLE IF EXISTS cards DROP CONSTRAINT IF EXISTS cards_unique_name_set;

-- Prevent placeholder cards from entering the catalog.
ALTER TABLE IF EXISTS cards
    ADD CONSTRAINT cards_no_unknown_placeholders
    CHECK (
        (set_name IS NULL OR lower(btrim(set_name)) <> 'unknown')
        AND (card_number IS NULL OR lower(btrim(card_number)) <> 'unknown')
        AND (set_code IS NULL OR (lower(btrim(set_code)) <> 'unknown' AND lower(btrim(set_code)) NOT LIKE 'unknown-%'))
    );

-- Raw Tradera auctions (source of truth for imports).
CREATE TABLE IF NOT EXISTS tradera_auctions (
    item_id BIGINT PRIMARY KEY,
    category_id INT NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    price INT NULL,
    bid_count INT NULL,
    seller_id BIGINT NULL,
    seller_alias TEXT NULL,
    title TEXT NULL,
    item_url TEXT NULL,
    thumbnail_url TEXT NULL,
    tradera_attributes JSONB NULL,
    image_urls JSONB NULL,
    description TEXT NULL,
    item_condition TEXT NULL,
    pokemon_era TEXT NULL,
    pokemon_language TEXT NULL,
    raw JSONB NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tradera_auctions_end_date_desc ON tradera_auctions (end_date DESC);
CREATE INDEX IF NOT EXISTS idx_tradera_auctions_pokemon_era ON tradera_auctions (pokemon_era);
CREATE INDEX IF NOT EXISTS idx_tradera_auctions_language ON tradera_auctions (pokemon_language);

-- Linked auctions table (populated by linking feature).
CREATE TABLE IF NOT EXISTS tradera_auction_card_links (
    item_id BIGINT PRIMARY KEY REFERENCES tradera_auctions(item_id) ON DELETE CASCADE,
    card_id INT NOT NULL REFERENCES cards(id),
    linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    method TEXT,
    confidence_score INT,
    status TEXT NOT NULL DEFAULT 'linked'
);

CREATE INDEX IF NOT EXISTS idx_tradera_links_card_id ON tradera_auction_card_links (card_id);
