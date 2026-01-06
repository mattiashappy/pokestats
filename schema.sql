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
    category_id INT NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    price INT NULL,
    bid_count INT NULL,
    seller_id BIGINT NULL,
    seller_alias TEXT NULL,
    title TEXT NULL,
    item_url TEXT NULL,
    thumbnail_url TEXT NULL,
    card_id INT NULL REFERENCES cards(id),
    raw JSONB NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auctions_card_id ON auctions (card_id);
CREATE INDEX IF NOT EXISTS idx_auctions_end_date_desc ON auctions (end_date DESC);
CREATE INDEX IF NOT EXISTS idx_auctions_updated_at_desc ON auctions (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_auctions_unlinked_end_date ON auctions (end_date DESC) WHERE card_id IS NULL;

-- Enrichment side-car table; can be truncated/recomputed.
CREATE TABLE IF NOT EXISTS auction_enrichment (
    item_id BIGINT PRIMARY KEY REFERENCES auctions(item_id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'unmatched',
    stage TEXT NOT NULL DEFAULT 'era',
    confidence_score INT NULL,
    method TEXT NULL,
    matched_set_code TEXT NULL,
    matched_era TEXT NULL,
    parsed_card_number TEXT NULL,
    parsed_number_text TEXT NULL,
    parsed_set_hint TEXT NULL,
    parsed_card_name TEXT NULL,
    parsed_set_candidates JSONB NULL,
    suggested_cards JSONB NULL,
    notes JSONB NULL,
    debug JSONB NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auction_enrichment_status ON auction_enrichment (status);
CREATE INDEX IF NOT EXISTS idx_auction_enrichment_stage ON auction_enrichment (stage);

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
    a.title,
    a.item_url,
    a.thumbnail_url,
    a.card_id,
    ae.status AS enrich_status,
    ae.confidence_score AS match_confidence_score,
    ae.method AS match_method,
    ae.matched_set_code,
    ae.matched_era,
    ae.parsed_card_number,
    ae.parsed_number_text,
    ae.parsed_set_hint,
    ae.suggested_cards,
    COALESCE(ae.updated_at, a.updated_at) AS updated_at
FROM auctions a
LEFT JOIN auction_enrichment ae ON ae.item_id = a.item_id;

-- Claim queue for unlinked auctions plus enrichment data.
CREATE OR REPLACE VIEW auction_claim_queue AS
SELECT
    a.item_id,
    a.category_id,
    a.end_date,
    a.price,
    a.bid_count,
    a.seller_id,
    a.seller_alias,
    a.title,
    a.item_url,
    a.thumbnail_url,
    a.card_id,
    ae.status AS enrich_status,
    ae.confidence_score AS match_confidence_score,
    ae.method AS match_method,
    ae.matched_set_code,
    ae.matched_era,
    ae.parsed_card_number,
    ae.parsed_number_text,
    ae.parsed_set_hint,
    ae.suggested_cards,
    COALESCE(ae.updated_at, a.updated_at) AS updated_at
FROM auctions a
LEFT JOIN auction_enrichment ae ON ae.item_id = a.item_id
WHERE a.card_id IS NULL;
