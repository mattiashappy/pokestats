-- 1) Drop views that depend on old enrichment tables
DROP VIEW IF EXISTS auction_claim_queue CASCADE;
DROP VIEW IF EXISTS tradera_sales CASCADE;

-- 2) Drop old enrichment table (now safe)
DROP TABLE IF EXISTS auction_enrichment CASCADE;

-- 3) Drop legacy table already removed, keep idempotent
DROP TABLE IF EXISTS tradera_sales_legacy CASCADE;

-- 1.2 Keep the old auctions table as an archive, but stop using it
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='auctions' AND table_schema='public') THEN
    ALTER TABLE public.auctions RENAME TO auctions_old;
  END IF;
END $$;

-- 1.3 Ensure the new tables exist (idempotent)
CREATE TABLE IF NOT EXISTS tradera_auctions (
  item_id         bigint PRIMARY KEY,
  category_id     integer NOT NULL,
  end_date        timestamptz NOT NULL,
  price           integer,
  bid_count       integer,
  seller_id       bigint,
  seller_alias    text,
  title           text,
  item_url        text,
  thumbnail_url   text,

  tradera_attributes jsonb,
  image_urls         jsonb,
  description        text,
  item_condition     text,
  pokemon_era        text,
  pokemon_language   text,

  raw             jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tradera_auctions_end_date_desc ON tradera_auctions (end_date DESC);
CREATE INDEX IF NOT EXISTS idx_tradera_auctions_pokemon_era    ON tradera_auctions (pokemon_era);
CREATE INDEX IF NOT EXISTS idx_tradera_auctions_language       ON tradera_auctions (pokemon_language);

CREATE TABLE IF NOT EXISTS tradera_auction_card_links (
  item_id   bigint PRIMARY KEY REFERENCES tradera_auctions(item_id) ON DELETE CASCADE,
  card_id   integer NOT NULL REFERENCES cards(id),
  linked_at timestamptz NOT NULL DEFAULT now(),
  method    text,
  status    text NOT NULL DEFAULT 'linked'
);

CREATE INDEX IF NOT EXISTS idx_tradera_links_card_id ON tradera_auction_card_links (card_id);

-- 1.4 If we want to fully reset imported auctions
TRUNCATE TABLE tradera_auction_card_links RESTART IDENTITY;
TRUNCATE TABLE tradera_auctions RESTART IDENTITY;
