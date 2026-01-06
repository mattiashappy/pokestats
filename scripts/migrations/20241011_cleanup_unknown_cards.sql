-- Cleanup invalid enrichment placeholder cards and add guardrails to prevent reintroduction.
DO $$
DECLARE
  has_cards BOOLEAN := to_regclass('public.cards') IS NOT NULL;
  has_source BOOLEAN := FALSE;
  has_set_name BOOLEAN := FALSE;
  has_card_number BOOLEAN := FALSE;
  has_set_code BOOLEAN := FALSE;
  has_legacy BOOLEAN := to_regclass('public.tradera_sales_legacy') IS NOT NULL;
BEGIN
  IF NOT has_cards THEN
    RAISE NOTICE 'cards table missing; skipping cleanup';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cards' AND column_name = 'source'
  ) INTO has_source;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cards' AND column_name = 'set_name'
  ) INTO has_set_name;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cards' AND column_name = 'card_number'
  ) INTO has_card_number;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cards' AND column_name = 'set_code'
  ) INTO has_set_code;

  IF has_source AND has_set_name AND has_card_number AND has_set_code THEN
    CREATE TEMP TABLE bad_cards AS
    SELECT id
    FROM public.cards
    WHERE source = 'enrichment'
      AND (
        lower(btrim(set_name)) = 'unknown'
        OR lower(btrim(card_number)) = 'unknown'
        OR lower(btrim(set_code)) LIKE 'unknown-%'
      );

    IF has_legacy THEN
      UPDATE public.tradera_sales_legacy
      SET card_id = NULL
      WHERE card_id IN (SELECT id FROM bad_cards);
    END IF;

    DELETE FROM public.cards WHERE id IN (SELECT id FROM bad_cards);

    DROP TABLE bad_cards;
  ELSE
    RAISE NOTICE 'Skipping cleanup because cards columns were missing (source/set_name/card_number/set_code).';
  END IF;

  IF has_set_name AND has_card_number AND has_set_code THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      JOIN pg_class t ON t.oid = c.conrelid
      WHERE n.nspname = 'public'
        AND t.relname = 'cards'
        AND c.conname = 'cards_no_unknown_placeholders'
    ) THEN
      ALTER TABLE public.cards
      ADD CONSTRAINT cards_no_unknown_placeholders
      CHECK (
        (set_name IS NULL OR lower(btrim(set_name)) <> 'unknown')
        AND (card_number IS NULL OR lower(btrim(card_number)) <> 'unknown')
        AND (set_code IS NULL OR (lower(btrim(set_code)) <> 'unknown' AND lower(btrim(set_code)) NOT LIKE 'unknown-%'))
      );
    END IF;
  ELSE
    RAISE NOTICE 'Skipping constraint because cards columns were missing (set_name/card_number/set_code).';
  END IF;
END $$;
