-- Add enrichment and manual mapping columns to tradera_sales
ALTER TABLE IF EXISTS public.tradera_sales
  ADD COLUMN IF NOT EXISTS card_id INTEGER REFERENCES public.cards(id),
  ADD COLUMN IF NOT EXISTS match_confidence TEXT,
  ADD COLUMN IF NOT EXISTS match_method TEXT,
  ADD COLUMN IF NOT EXISTS parsed_name TEXT,
  ADD COLUMN IF NOT EXISTS parsed_card_number TEXT,
  ADD COLUMN IF NOT EXISTS parsed_set_hint TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_tradera_sales_card_id ON public.tradera_sales (card_id);
CREATE INDEX IF NOT EXISTS idx_tradera_sales_match_confidence ON public.tradera_sales (match_confidence);
CREATE INDEX IF NOT EXISTS idx_tradera_sales_updated_at ON public.tradera_sales (updated_at DESC);
