import { CaseConversionPolicy, SenderError, schema, table, t, } from "spacetimedb/server";
const marketState = table({ public: true }, {
    symbol: t.string().primaryKey(),
    priceUsd: t.f64(),
    updatedAtMs: t.f64(),
});
const prediction = table({ public: true }, {
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
});
const leaderboard = table({ public: true }, {
    userAlias: t.string().primaryKey(),
    score: t.i32(),
    wins: t.u32(),
    losses: t.u32(),
    total: t.u32(),
});
const botProfile = table({ public: true }, {
    userAlias: t.string().primaryKey(),
    displayName: t.string(),
    strategy: t.string(),
});
const spacetime = schema({
    marketState,
    prediction,
    leaderboard,
    botProfile,
}, {
    CASE_CONVERSION_POLICY: CaseConversionPolicy.None,
});
export default spacetime;
const STARTER_MARKETS = [
    { symbol: "BTC-USD", priceUsd: 62000 },
    { symbol: "ETH-USD", priceUsd: 3200 },
];
const DEMO_BOTS = [
    {
        userAlias: "quant_khan",
        displayName: "Quant Khan",
        strategy: "Momentum",
        seedScore: 22,
        seedWins: 8,
        seedLosses: 6,
    },
    {
        userAlias: "wave_rider",
        displayName: "Wave Rider",
        strategy: "Mean Reversion",
        seedScore: 17,
        seedWins: 7,
        seedLosses: 6,
    },
    {
        userAlias: "delta_hawk",
        displayName: "Delta Hawk",
        strategy: "Breakout",
        seedScore: 11,
        seedWins: 6,
        seedLosses: 7,
    },
    {
        userAlias: "macro_marauder",
        displayName: "Macro Marauder",
        strategy: "News Driven",
        seedScore: 9,
        seedWins: 5,
        seedLosses: 6,
    },
    {
        userAlias: "sigma_scout",
        displayName: "Sigma Scout",
        strategy: "Scalping",
        seedScore: 5,
        seedWins: 4,
        seedLosses: 5,
    },
];
function nowMs(ctx) {
    return Number(ctx.timestamp.toMillis());
}
function aliasKey(userAlias) {
    return userAlias.trim().toLowerCase();
}
function findMarketRow(ctx, symbol) {
    for (const row of ctx.db.marketState.iter()) {
        if (row.symbol === symbol) {
            return row;
        }
    }
    return null;
}
function findBotProfileRow(ctx, userAlias) {
    for (const row of ctx.db.botProfile.iter()) {
        if (row.userAlias === userAlias) {
            return row;
        }
    }
    return null;
}
function putMarketState(ctx, symbol, priceUsd, updatedAtMs) {
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
function findLeaderboardRow(ctx, userAlias) {
    for (const row of ctx.db.leaderboard.iter()) {
        if (row.userAlias === userAlias) {
            return row;
        }
    }
    return null;
}
function ensureDemoEntities(ctx) {
    for (const bot of DEMO_BOTS) {
        const existingBot = findBotProfileRow(ctx, bot.userAlias);
        if (!existingBot) {
            ctx.db.botProfile.insert({
                userAlias: bot.userAlias,
                displayName: bot.displayName,
                strategy: bot.strategy,
            });
        }
        const existingLeaderboard = findLeaderboardRow(ctx, bot.userAlias);
        if (!existingLeaderboard) {
            ctx.db.leaderboard.insert({
                userAlias: bot.userAlias,
                score: bot.seedScore,
                wins: bot.seedWins,
                losses: bot.seedLosses,
                total: bot.seedWins + bot.seedLosses,
            });
        }
    }
}
function updateLeaderboard(ctx, userAlias, correct) {
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
function resolveDuePredictions(ctx, symbol, priceUsd, atMs) {
    const due = [];
    for (const row of ctx.db.prediction.iter()) {
        if (row.symbol === symbol && !row.resolved && row.resolveAtMs <= atMs) {
            due.push(row);
        }
    }
    for (const row of due) {
        const correct = row.direction === "up"
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
function openPredictionCountForUser(ctx, userAlias) {
    const targetAlias = aliasKey(userAlias);
    let open = 0;
    for (const row of ctx.db.prediction.iter()) {
        if (aliasKey(row.userAlias) === targetAlias && !row.resolved) {
            open += 1;
        }
    }
    return open;
}
function hasDuplicateOpenPrediction(ctx, input) {
    const targetAlias = aliasKey(input.userAlias);
    for (const row of ctx.db.prediction.iter()) {
        if (!row.resolved &&
            aliasKey(row.userAlias) === targetAlias &&
            row.symbol === input.symbol &&
            row.direction === input.direction &&
            Number(row.horizonMinutes) === input.horizonMinutes) {
            return true;
        }
    }
    return false;
}
function insertPrediction(ctx, input, preventDuplicates = true) {
    if (preventDuplicates && hasDuplicateOpenPrediction(ctx, input)) {
        return "duplicate";
    }
    const market = findMarketRow(ctx, input.symbol);
    if (!market) {
        return "missing_market";
    }
    const createdAtMs = nowMs(ctx);
    ctx.db.prediction.insert({
        id: 0,
        userAlias: input.userAlias,
        symbol: input.symbol,
        direction: input.direction,
        horizonMinutes: input.horizonMinutes,
        entryPriceUsd: market.priceUsd,
        createdAtMs,
        resolveAtMs: createdAtMs + input.horizonMinutes * 60 * 1000,
        resolved: false,
        correct: false,
    });
    return "ok";
}
function chooseDemoDirection(atMs, idx) {
    return Math.floor(atMs / 60000 + idx) % 2 === 0 ? "up" : "down";
}
export const init = spacetime.init((ctx) => {
    const current = nowMs(ctx);
    for (const seed of STARTER_MARKETS) {
        putMarketState(ctx, seed.symbol, seed.priceUsd, current);
    }
    ensureDemoEntities(ctx);
});
export const submitPrediction = spacetime.reducer({
    name: "submitPrediction",
}, {
    userAlias: t.string(),
    symbol: t.string(),
    direction: t.string(),
    horizonMinutes: t.u16(),
}, (ctx, { userAlias, symbol, direction, horizonMinutes }) => {
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
    const insertResult = insertPrediction(ctx, {
        userAlias: normalizedAlias,
        symbol,
        direction,
        horizonMinutes,
    });
    if (insertResult === "missing_market") {
        throw new SenderError(`Unsupported symbol: ${symbol}`);
    }
    if (insertResult === "duplicate") {
        throw new SenderError("Duplicate open prediction: you already have this exact call active.");
    }
});
export const upsertMarketTick = spacetime.reducer({
    name: "upsertMarketTick",
}, {
    symbol: t.string(),
    priceUsd: t.f64(),
    atMs: t.f64(),
}, (ctx, { symbol, priceUsd, atMs }) => {
    putMarketState(ctx, symbol, priceUsd, atMs);
    resolveDuePredictions(ctx, symbol, priceUsd, atMs);
});
export const generateDemoActivity = spacetime.reducer({
    name: "generateDemoActivity",
}, (ctx) => {
    ensureDemoEntities(ctx);
    const current = nowMs(ctx);
    const symbols = ["BTC-USD", "ETH-USD"];
    for (const [index, bot] of DEMO_BOTS.entries()) {
        if (openPredictionCountForUser(ctx, bot.userAlias) >= 2) {
            continue;
        }
        const symbol = symbols[(Math.floor(current / 30000) + index) % symbols.length];
        const direction = chooseDemoDirection(current, index);
        const horizonMinutes = ((Math.floor(current / 60000) + index) % 3) + 1;
        insertPrediction(ctx, {
            userAlias: bot.userAlias,
            symbol,
            direction,
            horizonMinutes,
        });
    }
});
