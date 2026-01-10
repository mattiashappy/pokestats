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
    "source" "text" DEFAULT 'catalog'::"text",
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
-- Name: cards_unique_expansion_number; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "cards_unique_expansion_number" ON "public"."cards" USING "btree" ("expansion_id", "card_number") WHERE (("expansion_id" IS NOT NULL) AND ("card_number" IS NOT NULL));


--
-- Name: cards_unique_setcode_number; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "cards_unique_setcode_number" ON "public"."cards" USING "btree" ("set_code", "card_number") WHERE (("set_code" IS NOT NULL) AND ("card_number" IS NOT NULL));


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
-- PostgreSQL database dump complete
--
