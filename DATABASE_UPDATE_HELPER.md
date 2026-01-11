Database Update Helper

Use this file to capture the latest database structure and any schema changes.
Fill in each section with the current, authoritative details from the database.

Overview

We rebuilt the schema to model Pokémon cards in a way that matches real card identifiers and Tradera auction titles. Most auctions include a collector number in the format N/N (e.g. 50/62, 62/101) and modern secret cards may be number > printed_total (e.g. 166/165).
High-level changes:

Set-level facts moved to expansions

Card-level facts moved to cards, including both:

collector_number_raw (unchanged raw string)

parsed fields (collector_key, number, printed_total, is_secret) for fast matching

Auction-to-card resolution uses tradera_auction_card_links referencing cards(id)

tradera_auctions, eras, import_runs remain present and are not part of this redesign

Primary matching strategy for enrichment:

Parse N/N from auction title into collector_key

Infer the correct expansion_id

Match using (expansion_id, collector_key) (unique when collector_key exists)

Tables
Table: expansions

Purpose: Stores set/expansion metadata (set-level facts). Cards reference expansions via expansion_id.

Columns:

Column	Type	Nullable	Default	Notes
id	integer	not null	nextval('expansions_id_seq'::regclass)	Primary key
set_code	text	not null		Unique set identifier (e.g. SV_151)
set_name	text	not null		Human set name (e.g. 151)
era	text	null		Optional era/category (e.g. “Scarlet & Violet”)
base_total	integer	null		Printed base total (e.g. 165)
set_total	integer	null		Full set size incl. secrets (e.g. 207)
created_at	timestamptz	not null	now()	Created timestamp

Constraints:

Primary Key: expansions_pkey on (id)

Unique: expansions_set_code_key on (set_code)

Indexes:

expansions_pkey (btree, id)

expansions_set_code_key (btree, set_code)

Relationships:

Referenced by cards.expansion_id (FK, ON DELETE CASCADE)

Table: cards

Purpose: Stores card facts and collector identifiers used for matching auctions. Each card belongs to one expansion.

Columns:

Column	Type	Nullable	Default	Notes
id	integer	not null	nextval('cards_id_seq'::regclass)	Primary key
expansion_id	integer	not null		FK to expansions(id) (ON DELETE CASCADE)
name	text	not null		Card name (e.g. “Kabuto”, “Pikachu”)
collector_number_raw	text	not null		Raw collector identifier as provided (e.g. 50/62, 166/165, promo formats)
collector_key	text	null		Normalized N/N (no spaces/leading zeros). Must match regex ^\d+/\d+$ when not null
number	integer	null		Parsed left side of N/N
printed_total	integer	null		Parsed right side of N/N
is_secret	boolean	null		True when number > printed_total (only meaningful when both exist)
image_url	text	null		Optional image URL
source	text	not null	'json'::text	Data source (default json)
created_at	timestamptz	not null	now()	Created timestamp

Constraints:

Primary Key: cards_pkey on (id)

Check: cards_collector_key_format

collector_key IS NULL OR collector_key ~ '^\d+/\d+$'

Check: cards_number_pair_consistency

(number IS NULL AND printed_total IS NULL) OR (number IS NOT NULL AND printed_total IS NOT NULL)

Unique Index (partial): cards_unique_expansion_collectorkey on (expansion_id, collector_key) where collector_key IS NOT NULL

Unique Index: cards_unique_expansion_raw on (expansion_id, collector_number_raw)

Indexes:

cards_pkey (btree, id)

cards_unique_expansion_collectorkey (btree, expansion_id, collector_key) WHERE collector_key IS NOT NULL

cards_unique_expansion_raw (btree, expansion_id, collector_number_raw)

idx_cards_expansion_number (btree, expansion_id, number) WHERE number IS NOT NULL

idx_cards_name (btree, name)

Relationships:

FK: cards_expansion_id_fkey → expansions(id) (ON DELETE CASCADE)

Referenced by tradera_auction_card_links.card_id (FK, ON DELETE CASCADE)

Table: tradera_auction_card_links

Purpose: Stores the resolved match from a Tradera auction to a specific card in cards, including confidence and method metadata.

Columns:

Column	Type	Nullable	Default	Notes
id	integer	not null	serial/sequence	Primary key
auction_id	bigint	not null		Tradera auction identifier (unique per row)
card_id	integer	not null		FK to cards(id)
confidence	numeric(5,4)	null		Match confidence (0.0000–1.0000)
method	text	null		Matching method label (e.g. title_regex, set_hint)
created_at	timestamptz	not null	now()	Created timestamp

Constraints:

Primary Key: on (id)

Unique: on (auction_id)

FK: tradera_auction_card_links_card_id_fkey → cards(id) (ON DELETE CASCADE)

Indexes:

Index on card_id (btree) (name may vary, e.g. idx_links_card_id)

Unique index on auction_id (implicit via UNIQUE constraint)

Relationships:

Many links → one card (card_id)

Each auction_id can link to at most one card

Views / Materialized Views

None.

Enums / Types

None.

Migrations

Schema was rebuilt manually via SQL (drop/recreate) and verified in psql via:

\dt

\d expansions

\d cards

Ordering dependencies:

expansions must exist before cards

cards must exist before tradera_auction_card_links

Notes

collector_number_raw always stores the raw identifier string (never mutate source data).

collector_key is the normalized N/N string used for matching and is only set when the raw value matches numeric N/N.

number and printed_total must be both NULL or both set (enforced by check constraint).

is_secret is true when number > printed_total (e.g. 166/165), commonly used for modern sets.

Matching auctions:

Parse (\d+)\s*/\s*(\d+) from titles and normalize to collector_key = '{number}/{printed_total}'

Infer expansion_id using set hints in title; then match by (expansion_id, collector_key)

If expansion is unknown, query candidates by collector_key across all expansions and score.

Other tables present (tradera_auctions, eras, import_runs) are not detailed here; they remain unchanged.
