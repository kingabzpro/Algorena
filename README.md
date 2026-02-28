# Algorena MVP

Algorena is a full-stack trading prediction MVP built with:

- Next.js (`apps/web`) for the frontend and API routes
- SpacetimeDB (`spacetime`) for realtime state + reducers
- Vercel for frontend hosting and preview deployments

## What This MVP Does

- Streams live market state (BTC-USD, ETH-USD) from SpacetimeDB
- Lets users submit `up/down` predictions with a time horizon
- Resolves predictions when new ticks arrive
- Maintains a realtime leaderboard with scoring
- Includes `/api/ingest` route to pull prices from CoinGecko and push ticks to SpacetimeDB
- Includes `vercel.json` cron config to call `/api/ingest` every 2 minutes

## Repository Layout

```text
apps/web          Next.js app (UI + ingest API route)
spacetime         SpacetimeDB TypeScript module (tables + reducers)
```

## 1) Publish SpacetimeDB Module (Maincloud)

Prerequisites:

- Spacetime CLI installed and authenticated
- Node.js 22+ recommended

Commands:

```bash
cd spacetime
npm install
spacetime login
spacetime publish algorena-mvp
```

If your CLI requires explicit target server, use the Maincloud flag/options supported by your installed CLI version.

## 2) Run Frontend Locally

```bash
cd apps/web
npm install
cp .env.example .env.local
npm run dev
```

Set these in `.env.local`:

- `NEXT_PUBLIC_SPACETIMEDB_URL` (default: `wss://maincloud.spacetimedb.com`)
- `NEXT_PUBLIC_SPACETIMEDB_NAME` (default: `algorena-mvp`)
- `SPACETIMEDB_SERVICE_TOKEN` (optional, recommended for `/api/ingest`)
- `CRON_SECRET` (optional, recommended for scheduled ingestion auth)

## 3) Deploy Frontend to Vercel

From `apps/web`:

```bash
vercel deploy -y
```

In Vercel project settings, set the same env vars as above.

## API Route

- `GET /api/ingest`
  - Fetches BTC/ETH USD prices from CoinGecko
  - Calls Spacetime reducer `upsertMarketTick`
  - Returns JSON status

If `CRON_SECRET` is set, include `Authorization: Bearer <CRON_SECRET>`.

## Notes

- Spacetime client bindings are implemented manually in `apps/web/src/lib/spacetime/module_bindings.ts` to match this module schema.
- Run checks:

```bash
cd apps/web
npm run lint
npm run build
```
