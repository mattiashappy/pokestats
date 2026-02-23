CREATE TABLE IF NOT EXISTS public.set_value_snapshots (
  set_id TEXT NOT NULL REFERENCES public.pt_sets (pt_set_id),
  date DATE NOT NULL,
  market_total NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (set_id, date)
);

CREATE INDEX IF NOT EXISTS set_value_snapshots_date_desc_idx
  ON public.set_value_snapshots (date DESC);

CREATE INDEX IF NOT EXISTS set_value_snapshots_set_id_date_desc_idx
  ON public.set_value_snapshots (set_id, date DESC);

CREATE OR REPLACE VIEW public.v_set_metrics_current AS
SELECT
  c.pt_set_id AS set_id,
  COUNT(*)::int AS cards_total,
  COALESCE(SUM(c.price_market), 0)::numeric AS market_total
FROM public.pt_cards c
GROUP BY c.pt_set_id;
