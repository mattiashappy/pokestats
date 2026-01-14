CREATE TABLE IF NOT EXISTS public.pt_sets (
  pt_set_id TEXT PRIMARY KEY,
  tcgplayer_set_id TEXT UNIQUE,
  name TEXT NOT NULL,
  series TEXT NULL,
  release_date DATE NULL,
  card_count INT NULL,
  image_cdn_url TEXT NULL,
  image_cdn_url200 TEXT NULL,
  image_cdn_url400 TEXT NULL,
  image_cdn_url800 TEXT NULL,
  image_url TEXT NULL,
  price_guide_url TEXT NULL,
  has_price_guide BOOLEAN NULL,
  no_price_guide_reason TEXT NULL,
  created_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS public.pt_cards (
  pt_card_id TEXT PRIMARY KEY,
  tcgplayer_product_id INT UNIQUE NULL,
  pt_set_id TEXT NULL REFERENCES public.pt_sets (pt_set_id),
  set_name TEXT NULL,
  name TEXT NOT NULL,
  card_number TEXT NULL,
  total_set_number TEXT NULL,
  rarity TEXT NULL,
  card_type TEXT NULL,
  hp INT NULL,
  stage TEXT NULL,
  artist TEXT NULL,
  tcgplayer_url TEXT NULL,
  image_cdn_url TEXT NULL,
  image_cdn_url200 TEXT NULL,
  image_cdn_url400 TEXT NULL,
  image_cdn_url800 TEXT NULL,
  price_market NUMERIC NULL,
  price_listings INT NULL,
  price_primary_condition TEXT NULL,
  price_primary_printing TEXT NULL,
  price_last_updated TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pt_cards_pt_set_id_idx ON public.pt_cards (pt_set_id);
CREATE INDEX IF NOT EXISTS pt_cards_name_idx ON public.pt_cards (name);
CREATE INDEX IF NOT EXISTS pt_cards_card_number_idx ON public.pt_cards (card_number);
CREATE INDEX IF NOT EXISTS pt_cards_set_name_card_number_idx ON public.pt_cards (set_name, card_number);
