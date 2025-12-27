# PokéStats dashboard

Vite + React + TypeScript dashboard scaffold using Tailwind CSS and shadcn/ui components. It provides a marketing landing page, mock auth + subscription gating, protected routes, and placeholder analytics views that consume mocked API endpoints.

## Stack

- React Router for routing and route guards
- React Query for data fetching
- Tailwind + shadcn/ui-inspired primitives for styling
- React Hook Form + Zod for form validation
- Recharts installed for future visualizations

## Available pages

- `/` – Landing page with CTA links
- `/login` and `/signup` – Fake auth backed by `localStorage`
- `/billing` – Subscription status and toggles
- `/app` – Dashboard overview
- `/app/sales` – Sales table with filters powered by `/api/sales`
- `/app/settings` – Mock profile + subscription toggles

## Local development

```bash
npm install
npm run dev
```

The dev server runs on `http://localhost:5173`. The Express server in the repo root serves the built SPA and exposes `/api/sales` and `/api/health` when running `npm start` from the root.
