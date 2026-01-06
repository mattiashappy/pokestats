--
-- PostgreSQL database dump
--

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- *not* creating schema, since initdb creates it


--
-- Name: SCHEMA "public"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA "public" IS 'standard public schema';


--
-- Name: pg_stat_statements; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "public";


--
-- Name: EXTENSION "pg_stat_statements"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "pg_stat_statements" IS 'track planning and execution statistics of all SQL statements executed';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: auction_enrichment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."auction_enrichment" (
    "item_id" bigint NOT NULL,
    "status" "text" DEFAULT 'unmatched'::"text" NOT NULL,
    "confidence_score" integer,
    "method" "text",
    "matched_set_code" "text",
    "matched_era" "text",
    "parsed_card_number" "text",
    "parsed_number_text" "text",
    "parsed_set_hint" "text",
    "suggested_cards" "jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "parsed_card_name" "text",
    "stage" "text" DEFAULT 'era'::"text" NOT NULL
);


--
-- Name: auctions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."auctions" (
    "item_id" bigint NOT NULL,
    "category_id" integer NOT NULL,
    "end_date" timestamp with time zone NOT NULL,
    "price" integer,
    "bid_count" integer,
    "seller_id" bigint,
    "seller_alias" "text",
    "title" "text",
    "item_url" "text",
    "thumbnail_url" "text",
    "card_id" integer,
    "raw" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "parsed_set_code" "text"
);


--
-- Name: auction_claim_queue; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW "public"."auction_claim_queue" AS
 SELECT "a"."item_id",
    "a"."end_date",
    "a"."title",
    "a"."price",
    "a"."bid_count",
    "a"."seller_alias",
    "e"."status",
    "e"."confidence_score",
    "e"."matched_set_code",
    "e"."matched_era",
    "e"."parsed_card_number",
    "e"."parsed_number_text",
    "a"."updated_at"
   FROM ("public"."auctions" "a"
     LEFT JOIN "public"."auction_enrichment" "e" ON (("e"."item_id" = "a"."item_id")))
  WHERE ("a"."card_id" IS NULL)
  ORDER BY "a"."end_date" DESC;


--
-- Name: auction_link_state; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW "public"."auction_link_state" AS
 SELECT
        CASE
            WHEN ("card_id" IS NULL) THEN 'unlinked'::"text"
            ELSE 'linked'::"text"
        END AS "link_state",
    "count"(*) AS "count"
   FROM "public"."auctions"
  GROUP BY
        CASE
            WHEN ("card_id" IS NULL) THEN 'unlinked'::"text"
            ELSE 'linked'::"text"
        END
  ORDER BY ("count"(*)) DESC;


--
-- Name: cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."cards" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "era" "text",
    "set_name" "text" NOT NULL,
    "card_number" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "set_code" "text" NOT NULL,
    "set_total" integer,
    "source" "text" DEFAULT 'enrichment'::"text",
    "expansion_id" integer,
    "image_url" "text",
    "product_details" "text",
    CONSTRAINT "cards_no_unknown_placeholders" CHECK (((("set_name" IS NULL) OR ("lower"("btrim"("set_name")) <> 'unknown'::"text")) AND (("card_number" IS NULL) OR ("lower"("btrim"("card_number")) <> 'unknown'::"text")) AND (("set_code" IS NULL) OR (("lower"("btrim"("set_code")) <> 'unknown'::"text") AND ("lower"("btrim"("set_code")) !~~ 'unknown-%'::"text")))))
);


--
-- Name: cards_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."cards_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cards_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."cards_id_seq" OWNED BY "public"."cards"."id";


--
-- Name: expansions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."expansions" (
    "id" integer NOT NULL,
    "set_code" "text" NOT NULL,
    "name" "text",
    "era" "text",
    "language" "text" DEFAULT 'EN'::"text",
    "set_total" integer,
    "release_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "image_url" "text"
);


--
-- Name: expansions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."expansions_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: expansions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."expansions_id_seq" OWNED BY "public"."expansions"."id";


--
-- Name: import_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."import_runs" (
    "id" integer NOT NULL,
    "source" "text" DEFAULT 'tradera'::"text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "new_rows" integer DEFAULT 0 NOT NULL,
    "pages_fetched" integer DEFAULT 0 NOT NULL,
    "requests_used" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "message" "text",
    "run_uuid" "text",
    "error_stack" "text"
);


--
-- Name: import_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."import_runs_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: import_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."import_runs_id_seq" OWNED BY "public"."import_runs"."id";


--
-- Name: tradera_sales; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW "public"."tradera_sales" AS
 SELECT "a"."item_id",
    "a"."category_id",
    "a"."end_date",
    "a"."price",
    "a"."bid_count",
    "a"."seller_id",
    "a"."seller_alias",
    "a"."title",
    "a"."item_url",
    "a"."thumbnail_url",
    "a"."card_id",
    "e"."status" AS "enrich_status",
    "e"."confidence_score" AS "match_confidence_score",
    "e"."method" AS "match_method",
    "e"."matched_set_code",
    "e"."matched_era",
    "e"."parsed_card_number",
    "e"."parsed_number_text",
    "e"."parsed_set_hint",
    "e"."suggested_cards",
    "a"."updated_at"
   FROM ("public"."auctions" "a"
     LEFT JOIN "public"."auction_enrichment" "e" ON (("e"."item_id" = "a"."item_id")));


--
-- Name: tradera_sales_legacy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."tradera_sales_legacy" (
    "item_id" bigint NOT NULL,
    "category_id" integer NOT NULL,
    "end_date" timestamp with time zone NOT NULL,
    "price" integer,
    "bid_count" integer,
    "seller_id" bigint,
    "seller_alias" "text",
    "seller_dsr" double precision,
    "title" "text",
    "description" "text",
    "item_url" "text",
    "thumbnail_url" "text",
    "image_urls" "jsonb",
    "attributes" "jsonb",
    "fetched_at" timestamp with time zone DEFAULT "now"(),
    "card_id" integer,
    "parsed_card_name" "text",
    "parsed_number_text" "text",
    "parsed_card_no" integer,
    "parsed_total_in_set" integer,
    "parsed_set_guess" "text",
    "parsed_set_confidence" integer,
    "enrich_status" "text" DEFAULT 'unmatched'::"text",
    "enrich_confidence" integer,
    "enrich_notes" "jsonb",
    "parsed_set_code" "text",
    "match_confidence" "text",
    "match_method" "text",
    "parsed_name" "text",
    "parsed_card_number" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "parsed_set_hint" "text",
    "notes" "text",
    "suggested_cards" "jsonb",
    "parsed_set_candidates" "jsonb",
    "match_status" "text",
    "parsed_set_total" integer,
    "match_debug" "jsonb",
    "matched_era" "text",
    "matched_set_code" "text",
    "era" "text",
    "pokemon_era" "text",
    "match_confidence_score" integer,
    "processing_started_at" timestamp with time zone
);


--
-- Name: cards id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."cards" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."cards_id_seq"'::"regclass");


--
-- Name: expansions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."expansions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."expansions_id_seq"'::"regclass");


--
-- Name: import_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."import_runs" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."import_runs_id_seq"'::"regclass");


--
-- Name: auction_enrichment auction_enrichment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."auction_enrichment"
    ADD CONSTRAINT "auction_enrichment_pkey" PRIMARY KEY ("item_id");


--
-- Name: auctions auctions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."auctions"
    ADD CONSTRAINT "auctions_pkey" PRIMARY KEY ("item_id");


--
-- Name: cards cards_expansion_card_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."cards"
    ADD CONSTRAINT "cards_expansion_card_number_key" UNIQUE ("expansion_id", "card_number");


--
-- Name: cards cards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."cards"
    ADD CONSTRAINT "cards_pkey" PRIMARY KEY ("id");


--
-- Name: cards cards_unique_set_code_number; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."cards"
    ADD CONSTRAINT "cards_unique_set_code_number" UNIQUE ("set_code", "card_number");


--
-- Name: expansions expansions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."expansions"
    ADD CONSTRAINT "expansions_pkey" PRIMARY KEY ("id");


--
-- Name: expansions expansions_set_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."expansions"
    ADD CONSTRAINT "expansions_set_code_key" UNIQUE ("set_code");


--
-- Name: import_runs import_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."import_runs"
    ADD CONSTRAINT "import_runs_pkey" PRIMARY KEY ("id");


--
-- Name: tradera_sales_legacy tradera_sales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tradera_sales_legacy"
    ADD CONSTRAINT "tradera_sales_pkey" PRIMARY KEY ("item_id");


--
-- Name: cards_unique_expansion_number; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "cards_unique_expansion_number" ON "public"."cards" USING "btree" ("expansion_id", "card_number") WHERE (("expansion_id" IS NOT NULL) AND ("card_number" IS NOT NULL));


--
-- Name: cards_unique_setcode_number; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "cards_unique_setcode_number" ON "public"."cards" USING "btree" ("set_code", "card_number") WHERE (("set_code" IS NOT NULL) AND ("card_number" IS NOT NULL));


--
-- Name: idx_auction_enrichment_matched; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_auction_enrichment_matched" ON "public"."auction_enrichment" USING "btree" ("matched_era", "matched_set_code");


--
-- Name: idx_auction_enrichment_parsed_card_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_auction_enrichment_parsed_card_number" ON "public"."auction_enrichment" USING "btree" ("parsed_card_number");


--
-- Name: idx_auction_enrichment_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_auction_enrichment_stage" ON "public"."auction_enrichment" USING "btree" ("stage");


--
-- Name: idx_auction_enrichment_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_auction_enrichment_status" ON "public"."auction_enrichment" USING "btree" ("status");


--
-- Name: idx_auctions_card_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_auctions_card_id" ON "public"."auctions" USING "btree" ("card_id");


--
-- Name: idx_auctions_end_date_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_auctions_end_date_desc" ON "public"."auctions" USING "btree" ("end_date" DESC);


--
-- Name: idx_auctions_unlinked_end_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_auctions_unlinked_end_date" ON "public"."auctions" USING "btree" ("end_date" DESC) WHERE ("card_id" IS NULL);


--
-- Name: idx_auctions_unlinked_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_auctions_unlinked_recent" ON "public"."auctions" USING "btree" ("end_date" DESC) WHERE ("card_id" IS NULL);


--
-- Name: idx_auctions_updated_at_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_auctions_updated_at_desc" ON "public"."auctions" USING "btree" ("updated_at" DESC);


--
-- Name: idx_cards_card_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_cards_card_number" ON "public"."cards" USING "btree" ("card_number");


--
-- Name: idx_cards_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_cards_name" ON "public"."cards" USING "btree" ("name");


--
-- Name: idx_cards_set_cardnumber; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_cards_set_cardnumber" ON "public"."cards" USING "btree" ("set_name", "card_number");


--
-- Name: idx_cards_set_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_cards_set_code" ON "public"."cards" USING "btree" ("set_code");


--
-- Name: idx_cards_set_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_cards_set_name" ON "public"."cards" USING "btree" ("set_name");


--
-- Name: idx_expansions_era; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_expansions_era" ON "public"."expansions" USING "btree" ("era");


--
-- Name: idx_import_runs_run_uuid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_import_runs_run_uuid" ON "public"."import_runs" USING "btree" ("run_uuid");


--
-- Name: idx_import_runs_started_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_import_runs_started_at" ON "public"."import_runs" USING "btree" ("started_at" DESC);


--
-- Name: idx_tradera_card_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tradera_card_id" ON "public"."tradera_sales_legacy" USING "btree" ("card_id");


--
-- Name: idx_tradera_claim_queue_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tradera_claim_queue_updated" ON "public"."tradera_sales_legacy" USING "btree" ("updated_at") WHERE (("card_id" IS NULL) AND ("enrich_status" = ANY (ARRAY['unmatched'::"text", 'needs_review'::"text"])));


--
-- Name: idx_tradera_end_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tradera_end_date" ON "public"."tradera_sales_legacy" USING "btree" ("end_date" DESC);


--
-- Name: idx_tradera_enrich_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tradera_enrich_status" ON "public"."tradera_sales_legacy" USING "btree" ("enrich_status");


--
-- Name: idx_tradera_sales_card_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tradera_sales_card_id" ON "public"."tradera_sales_legacy" USING "btree" ("card_id");


--
-- Name: idx_tradera_sales_card_id_end_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tradera_sales_card_id_end_date" ON "public"."tradera_sales_legacy" USING "btree" ("card_id", "end_date" DESC);


--
-- Name: idx_tradera_sales_category_end_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tradera_sales_category_end_date" ON "public"."tradera_sales_legacy" USING "btree" ("category_id", "end_date");


--
-- Name: idx_tradera_sales_end_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tradera_sales_end_date" ON "public"."tradera_sales_legacy" USING "btree" ("end_date");


--
-- Name: idx_tradera_sales_match_confidence; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tradera_sales_match_confidence" ON "public"."tradera_sales_legacy" USING "btree" ("match_confidence");


--
-- Name: idx_tradera_sales_needs_review; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tradera_sales_needs_review" ON "public"."tradera_sales_legacy" USING "btree" ("end_date" DESC) WHERE (("enrich_status" = ANY (ARRAY['needs_review'::"text", 'unmatched'::"text"])) AND ("card_id" IS NULL));


--
-- Name: idx_tradera_sales_parsed_number_text; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tradera_sales_parsed_number_text" ON "public"."tradera_sales_legacy" USING "btree" ("parsed_number_text");


--
-- Name: idx_tradera_sales_parsed_set_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tradera_sales_parsed_set_code" ON "public"."tradera_sales_legacy" USING "btree" ("parsed_set_code");


--
-- Name: idx_tradera_sales_parsed_set_guess; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tradera_sales_parsed_set_guess" ON "public"."tradera_sales_legacy" USING "btree" ("parsed_set_guess");


--
-- Name: idx_tradera_sales_status_end_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tradera_sales_status_end_date" ON "public"."tradera_sales_legacy" USING "btree" ("enrich_status", "end_date" DESC);


--
-- Name: idx_tradera_sales_unlinked_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tradera_sales_unlinked_recent" ON "public"."tradera_sales_legacy" USING "btree" ("end_date" DESC) WHERE ("card_id" IS NULL);


--
-- Name: idx_tradera_sales_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tradera_sales_updated_at" ON "public"."tradera_sales_legacy" USING "btree" ("updated_at" DESC);


--
-- Name: auction_enrichment auction_enrichment_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."auction_enrichment"
    ADD CONSTRAINT "auction_enrichment_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."auctions"("item_id") ON DELETE CASCADE;


--
-- Name: auctions auctions_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."auctions"
    ADD CONSTRAINT "auctions_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id");


--
-- Name: cards cards_expansion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."cards"
    ADD CONSTRAINT "cards_expansion_id_fkey" FOREIGN KEY ("expansion_id") REFERENCES "public"."expansions"("id");


--
-- Name: tradera_sales_legacy tradera_sales_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tradera_sales_legacy"
    ADD CONSTRAINT "tradera_sales_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id");


--
-- PostgreSQL database dump complete
--

