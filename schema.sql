-- Core cards table kept for compatibility with import scripts.
CREATE TABLE IF NOT EXISTS cards (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    era TEXT,
    set_name TEXT,
    card_number TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (name, set_name)
);

-- Source-of-truth auctions table.
CREATE TABLE IF NOT EXISTS auctions (
    item_id BIGINT PRIMARY KEY,
    category_id INT,
    end_date TIMESTAMPTZ NOT NULL,
    price INT,
    bid_count INT,
    seller_id BIGINT,
    seller_alias TEXT,
    seller_dsr DOUBLE PRECISION,
    title TEXT,
    description TEXT,
    item_url TEXT,
    thumbnail_url TEXT,
    image_urls JSONB,
    attributes JSONB,
    fetched_at TIMESTAMPTZ DEFAULT now(),
    card_id INT REFERENCES cards(id),
    era TEXT,
    pokemon_era TEXT,
    raw JSONB,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auctions_end_date ON auctions (end_date DESC);
CREATE INDEX IF NOT EXISTS idx_auctions_card_id ON auctions (card_id);
CREATE INDEX IF NOT EXISTS idx_auctions_unlinked ON auctions (card_id) WHERE card_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_auctions_updated_at ON auctions (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_auctions_unlinked_end_date ON auctions (end_date DESC) WHERE card_id IS NULL;

-- Enrichment side-car table; can be truncated/recomputed.
CREATE TABLE IF NOT EXISTS auction_enrichment (
    item_id BIGINT PRIMARY KEY REFERENCES auctions(item_id),
    status TEXT NOT NULL DEFAULT 'unmatched',
    confidence TEXT,
    confidence_score INTEGER,
    method TEXT,
    matched_set_code TEXT,
    matched_era TEXT,
    parsed_card_no INTEGER,
    parsed_number_text TEXT,
    parsed_set_total INTEGER,
    candidates JSONB,
    debug JSONB,
    processing_started_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auction_enrichment_status ON auction_enrichment (status);

-- Compatibility view for existing queries that still target tradera_sales.
CREATE OR REPLACE VIEW tradera_sales AS
SELECT
    a.item_id,
    a.category_id,
    a.end_date,
    a.price,
    a.bid_count,
    a.seller_id,
    a.seller_alias,
    a.seller_dsr,
    a.title,
    a.description,
    a.item_url,
    a.thumbnail_url,
    a.image_urls,
    a.attributes,
    a.fetched_at,
    a.card_id,
    a.era,
    a.pokemon_era,
    COALESCE(ae.status, NULL) AS match_status,
    ae.status AS enrich_status,
    ae.status,
    ae.confidence AS match_confidence,
    ae.confidence_score AS match_confidence_score,
    ae.method AS match_method,
    ae.method,
    ae.matched_set_code,
    ae.matched_era,
    ae.parsed_card_no,
    ae.parsed_number_text,
    ae.parsed_set_total,
    ae.candidates,
    ae.debug AS match_debug,
    ae.debug,
    ae.processing_started_at,
    COALESCE(ae.updated_at, a.updated_at) AS updated_at,
    a.raw,
    ae.parsed_card_no AS parsed_card_number
FROM auctions a
LEFT JOIN auction_enrichment ae ON ae.item_id = a.item_id;
