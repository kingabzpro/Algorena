import {
  CaseConversionPolicy,
  SenderError,
  schema,
  table,
  t,
  type ReducerCtx,
} from "spacetimedb/server";

const marketState = table(
  { public: true },
  {
    symbol: t.string().primaryKey(),
    priceUsd: t.f64(),
    updatedAtMs: t.f64(),
  }
);

const prediction = table(
  { public: true },
  {
    id: t.u32().primaryKey().autoInc(),
    userAlias: t.string(),
    symbol: t.string(),
    direction: t.string(),
    horizonMinutes: t.u16(),
    entryPriceUsd: t.f64(),
    createdAtMs: t.f64(),
    resolveAtMs: t.f64(),
    resolved: t.bool(),
    correct: t.bool(),
  }
);

const leaderboard = table(
  { public: true },
  {
    userAlias: t.string().primaryKey(),
    score: t.i32(),
    wins: t.u32(),
    losses: t.u32(),
    total: t.u32(),
  }
);

const spacetime = schema(
  {
    marketState,
    prediction,
    leaderboard,
  },
  {
    CASE_CONVERSION_POLICY: CaseConversionPolicy.None,
  }
);

export default spacetime;

const STARTER_MARKETS: ReadonlyArray<{ symbol: string; priceUsd: number }> = [
  { symbol: "BTC-USD", priceUsd: 62000 },
  { symbol: "ETH-USD", priceUsd: 3200 },
];

function nowMs(ctx: ReducerCtx<typeof spacetime.schemaType>): number {
  return Number(ctx.timestamp.toMillis());
}

function findMarketRow(
  ctx: ReducerCtx<typeof spacetime.schemaType>,
  symbol: string
) {
  for (const row of ctx.db.marketState.iter()) {
    if (row.symbol === symbol) {
      return row;
    }
  }
  return null;
}

function putMarketState(
  ctx: ReducerCtx<typeof spacetime.schemaType>,
  symbol: string,
  priceUsd: number,
  updatedAtMs: number
) {
  const existing = findMarketRow(ctx, symbol);
  if (existing) {
    ctx.db.marketState.delete(existing);
  }

  ctx.db.marketState.insert({
    symbol,
    priceUsd,
    updatedAtMs,
  });
}

function findLeaderboardRow(
  ctx: ReducerCtx<typeof spacetime.schemaType>,
  userAlias: string
) {
  for (const row of ctx.db.leaderboard.iter()) {
    if (row.userAlias === userAlias) {
      return row;
    }
  }
  return null;
}

function updateLeaderboard(
  ctx: ReducerCtx<typeof spacetime.schemaType>,
  userAlias: string,
  correct: boolean
) {
  const existing = findLeaderboardRow(ctx, userAlias);

  if (existing) {
    ctx.db.leaderboard.delete(existing);

    ctx.db.leaderboard.insert({
      userAlias,
      score: existing.score + (correct ? 5 : -3),
      wins: existing.wins + (correct ? 1 : 0),
      losses: existing.losses + (correct ? 0 : 1),
      total: existing.total + 1,
    });
    return;
  }

  ctx.db.leaderboard.insert({
    userAlias,
    score: correct ? 5 : -3,
    wins: correct ? 1 : 0,
    losses: correct ? 0 : 1,
    total: 1,
  });
}

function resolveDuePredictions(
  ctx: ReducerCtx<typeof spacetime.schemaType>,
  symbol: string,
  priceUsd: number,
  atMs: number
) {
  const due: Array<ReturnType<typeof ctx.db.prediction.insert>> = [];

  for (const row of ctx.db.prediction.iter()) {
    if (row.symbol === symbol && !row.resolved && row.resolveAtMs <= atMs) {
      due.push(row);
    }
  }

  for (const row of due) {
    const correct =
      row.direction === "up"
        ? priceUsd >= row.entryPriceUsd
        : priceUsd <= row.entryPriceUsd;

    ctx.db.prediction.delete(row);
    ctx.db.prediction.insert({
      ...row,
      resolved: true,
      correct,
    });

    updateLeaderboard(ctx, row.userAlias, correct);
  }
}

export const init = spacetime.init((ctx) => {
  const current = nowMs(ctx);
  for (const seed of STARTER_MARKETS) {
    putMarketState(ctx, seed.symbol, seed.priceUsd, current);
  }
});

export const submitPrediction = spacetime.reducer(
  {
    name: "submitPrediction",
  },
  {
    userAlias: t.string(),
    symbol: t.string(),
    direction: t.string(),
    horizonMinutes: t.u16(),
  },
  (ctx, { userAlias, symbol, direction, horizonMinutes }) => {
    const normalizedAlias = userAlias.trim();
    if (!normalizedAlias) {
      throw new SenderError("userAlias is required");
    }

    if (direction !== "up" && direction !== "down") {
      throw new SenderError("direction must be 'up' or 'down'");
    }

    if (horizonMinutes < 1 || horizonMinutes > 240) {
      throw new SenderError("horizonMinutes must be in [1, 240]");
    }

    const market = findMarketRow(ctx, symbol);
    if (!market) {
      throw new SenderError(`Unsupported symbol: ${symbol}`);
    }

    const createdAtMs = nowMs(ctx);

    ctx.db.prediction.insert({
      id: 0,
      userAlias: normalizedAlias,
      symbol,
      direction,
      horizonMinutes,
      entryPriceUsd: market.priceUsd,
      createdAtMs,
      resolveAtMs: createdAtMs + horizonMinutes * 60 * 1000,
      resolved: false,
      correct: false,
    });
  }
);

export const upsertMarketTick = spacetime.reducer(
  {
    name: "upsertMarketTick",
  },
  {
    symbol: t.string(),
    priceUsd: t.f64(),
    atMs: t.f64(),
  },
  (ctx, { symbol, priceUsd, atMs }) => {
    putMarketState(ctx, symbol, priceUsd, atMs);
    resolveDuePredictions(ctx, symbol, priceUsd, atMs);
  }
);
