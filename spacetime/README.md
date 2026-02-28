# Spacetime Module (Algorena)

This module backs the Algorena MVP realtime data model.

## Tables

- `marketState`: latest symbol prices
- `prediction`: open/resolved user predictions
- `leaderboard`: aggregate trader scores

## Reducers

- `submitPrediction`
- `upsertMarketTick`

## Publish

```bash
npm install
spacetime login
spacetime publish algorena-mvp
```

Then point the Next.js app at this database with:

- `NEXT_PUBLIC_SPACETIMEDB_URL`
- `NEXT_PUBLIC_SPACETIMEDB_NAME`
