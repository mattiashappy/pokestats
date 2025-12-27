# PokeStats – Tradera Pokémon card importer

Backend-only MVP that ingests sold Pokémon card auctions from Tradera and stores
immutable market-price records in PostgreSQL.

## Components

- `schema.sql` – table definition and supporting indexes for `tradera_sales`.
- `scripts/tradera_importer.py` – daily importer that calls Tradera's SOAP v3
  SearchService, applies the date-based pagination rules, and upserts auction
  rows into PostgreSQL.
- `requirements.txt` – Python dependencies for the importer.

## Configuration

The importer is configured through environment variables (Heroku config vars):

- `TRADERA_APP_ID` – Tradera API app id (SOAP header).
- `TRADERA_APP_KEY` – Tradera API app key (SOAP header).
- `DATABASE_URL` – PostgreSQL connection string.
- `LOCAL_TIMEZONE` – Optional timezone for "yesterday" calculations; defaults to
  `Europe/Stockholm`.
- `MAX_PAGES` – Optional safety cap for pagination; defaults to `100` to respect
  the daily API call limit.

Aliases: if you already set `HEROKU_TRADERA_APP_ID` and `HEROKU_TRADERA_APP_KEY`
as config vars, the importer will pick those up as fallbacks so you don't need
to rename them.

- Add a Heroku Scheduler job to run `python scripts/tradera_importer.py` daily
  at 02:00 (local time Sweden).
- Ensure `DATABASE_URL`, `TRADERA_APP_ID`, and `TRADERA_APP_KEY` are configured
  as Heroku config vars.

## Optional local run

Local execution is not required, but you can verify connectivity with:

1. Install Python dependencies: `pip install -r requirements.txt`.
2. Create the table: `psql "$DATABASE_URL" -f schema.sql`.
3. Run the importer: `python scripts/tradera_importer.py`.

Console output includes pages fetched, items scanned, and the number of rows
imported for the target day.

## Heroku web dyno (health endpoint)

Heroku apps need an always-on web dyno to avoid router errors such as
`H14: No web processes running`. A tiny HTTP server in `server.py` listens on
`$PORT` and responds with a JSON health payload so the app can satisfy Heroku's
router checks even though the importer itself is triggered by Scheduler.

- `Procfile` defines the web process: `python server.py`.
- You can test locally with `python server.py` and visiting
  `http://localhost:8000/`.

## Dashboard (React + Tailwind)

A React + TypeScript dashboard scaffold lives in `/dashboard`, built with Vite,
Tailwind CSS, and shadcn/ui-inspired primitives. To run it locally:

1. `cd dashboard`
2. `npm install`
3. `npm run dev`

The dashboard renders sample sales data and filtering controls so you can
quickly explore a data-dense admin view while the backend importer evolves.
