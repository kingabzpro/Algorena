# Algorena MVP

Algorena is a realtime trading prediction app built with Next.js + SpacetimeDB.

## How It Works

1. The frontend (`apps/web`) subscribes to SpacetimeDB tables in realtime:
   - `marketState` (live BTC/ETH prices)
   - `prediction` (open + resolved calls)
   - `leaderboard` (scores)
2. A user submits an `up/down` prediction with a time horizon.
3. The backend (`spacetime`) validates and stores the call, blocks duplicate open calls from the same user (same symbol/direction/horizon), and resolves calls when fresh ticks arrive.
4. `/api/ingest` fetches BTC/ETH prices from CoinGecko, writes ticks to SpacetimeDB, and generates demo bot activity so the MVP stays active.
5. UI shows top 5 predictions by default, with `Explore all` for the full feed.

## Project Structure

```text
apps/web   Next.js UI + /api/ingest
spacetime  SpacetimeDB schema + reducers
```

## Run Locally

### 1) Publish the Spacetime module (Maincloud)

```bash
cd spacetime
npm install
spacetime login
spacetime publish algorena-mvp
```

### 2) Start the frontend

```bash
cd apps/web
npm install
npm run dev
```

Set `apps/web/.env.local`:

- `NEXT_PUBLIC_SPACETIMEDB_URL` (default: `wss://maincloud.spacetimedb.com`)
- `NEXT_PUBLIC_SPACETIMEDB_NAME` (default: `algorena-mvp`)
- `SPACETIMEDB_SERVICE_TOKEN` (recommended for `/api/ingest`)
- `CRON_SECRET` (optional, secures scheduled `/api/ingest`)

## Deploy (Vercel)

```bash
cd apps/web
vercel deploy -y
```

`apps/web/vercel.json` schedules `/api/ingest` every 2 minutes.
