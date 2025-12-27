# PokeStats dashboard

A React + TypeScript admin dashboard powered by Vite, Tailwind CSS, and shadcn/ui-inspired primitives. The layout focuses on a clean, data-dense overview of recent Pokémon card sales ingested by the backend importer.

## Features

- Hero section with quick actions for refreshing data and exporting CSV snapshots.
- Metrics cards summarizing total volume, price trends, rarity mix, and top sellers.
- Filters for rarity, region, and keyword search, plus configurable sorting.
- Data-dense table with rarity badges, condition, realized price, seller, and tags.

## Getting started

```bash
cd dashboard
npm install
npm run dev
```

By default the Vite dev server runs on `http://localhost:5173`. Tailwind configuration lives in `tailwind.config.cjs` and reusable UI primitives can be found under `src/components/ui`.
