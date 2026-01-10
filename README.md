# PokéStats – Frontend-first SaaS shell

A shadcn/ui + Tailwind SaaS dashboard scaffold for PokéStats. It ships a marketing landing page, mock auth + subscription gating, and protected dashboard routes ready for Stripe. The Express server serves the Vite build and exposes API routes seeded with Tradera auction data so the app runs end-to-end on Heroku without waiting on an importer.

## Project structure

- `dashboard/` – Vite + React + TypeScript frontend with shadcn/ui primitives, React Router, React Query, and form scaffolding.
- `server.js` – Express server that serves `dashboard/dist`, provides SPA fallback, and exposes `/api/health` + `/api/sales` mocks.
- `Procfile` – Runs the Node server on Heroku. (Legacy Python importer files remain but are not part of this UI deploy.)

## Features

- Landing page with CTA links to log in or start a subscription.
- Fake auth layer using `localStorage` with login/signup/logout flows.
- Subscription gating: inactive users are redirected to `/billing`; toggle status from settings or billing.
- Dashboard pages: overview, sales table with filters, settings, and billing.
- Mocked `/api/sales` + `/api/health` endpoints served by Express; React Query consumes Tradera auction data baked into `/api/sales`.
- SPA-safe routing so refreshing protected routes on Heroku continues to work.

## Local development

```bash
# Install root server deps and frontend deps
npm install

# Start the Vite dev server (frontend only)
npm run dev --prefix dashboard

# Type-check the frontend
npm run check --prefix dashboard
```

## Build & run the production bundle locally

```bash
npm run build        # builds the Vite app into dashboard/dist
npm start            # starts Express on http://localhost:8000 serving the built SPA
```

## Heroku deployment

> **Important:** Because this repo also contains legacy Python files, explicitly pin the Node buildpack so Heroku does not try to boot a Python dyno (which would fail with `node: command not found`). The included `app.json` does this for new pipelines, but it’s safest to set it manually on existing apps.

1. Create the app and set the Node buildpack + environment:
   ```bash
   heroku create pokestats-demo
   heroku buildpacks:clear
   heroku buildpacks:add heroku/nodejs
   heroku config:set NODE_ENV=production
   ```
2. Deploy from this repository root:
   ```bash
   git push heroku main
   ```
3. After deploy, verify the health endpoint and SPA routing:
   ```bash
   heroku open                      # loads the landing page
   heroku run curl https://$HEROKU_APP_NAME.herokuapp.com/api/health
   ```
4. Log in or sign up in the hosted app. Inactive accounts are sent to `/billing`; toggle the mock subscription to unlock `/app/*` routes.

## API mocks

- `GET /api/health` → `{ ok: true }`
- `GET /api/sales` → Sample Tradera auction rows consumed by the `/app/sales` table via React Query. When `DATABASE_URL` is set
  and the `auctions` table (or `tradera_sales` compatibility view) contains data, the endpoint automatically serves the live rows
  instead of the mock payload.

Swap these mocks for production endpoints when the backend is ready and wire Stripe webhooks to update `subscriptionStatus` server-side.

## Importing real Tradera data

The repo includes `scripts/tradera_importer.py`, a Python job that pulls ended auctions from Tradera’s SOAP API into PostgreSQL.
The Express API now checks for the Python runtime before spawning the job, so set `PYTHON_BIN` if your environment uses a non-default interpreter (for example, `python3`). You can run it locally to validate credentials and exercise the UI with live rows:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

export TRADERA_APP_ID=your_app_id
export TRADERA_APP_KEY=your_app_key
export DATABASE_URL=postgres://user:pass@host:5432/db

psql "$DATABASE_URL" -f schema.sql   # create auctions table if needed
python scripts/tradera_importer.py    # imports yesterday's ended auctions

npm start                             # /api/sales now returns the imported rows
```

If the database is empty or unavailable, `/api/sales` falls back to the baked-in mock data.
