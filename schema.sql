-- Schema for storing sold Tradera Pokémon card auctions.
-- Run once to create the table and supporting indexes.

CREATE TABLE IF NOT EXISTS cards (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    era TEXT,
    set_name TEXT,
    card_number TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (name, set_name)
);

CREATE TABLE IF NOT EXISTS tradera_sales (
    item_id BIGINT PRIMARY KEY,
    category_id INT NOT NULL,
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
    card_id INT NOT NULL REFERENCES cards(id)
);

CREATE INDEX IF NOT EXISTS idx_tradera_sales_end_date ON tradera_sales (end_date);
CREATE INDEX IF NOT EXISTS idx_tradera_sales_category_end_date ON tradera_sales (category_id, end_date);
-- Optional: enable once the table has enough data and queries need attribute filtering.
-- CREATE INDEX IF NOT EXISTS idx_tradera_sales_attributes_gin ON tradera_sales USING GIN (attributes);
