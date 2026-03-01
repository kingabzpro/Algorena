import { NextRequest, NextResponse } from "next/server";

import {
  DEFAULT_SPACETIMEDB_DB_NAME,
  DEFAULT_SPACETIMEDB_URL,
} from "@/lib/spacetime/config";
import { DbConnection } from "@/lib/spacetime/module_bindings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRICE_ENDPOINT =
  "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd";

function getServerConfig() {
  return {
    url: process.env.NEXT_PUBLIC_SPACETIMEDB_URL ?? DEFAULT_SPACETIMEDB_URL,
    dbName:
      process.env.NEXT_PUBLIC_SPACETIMEDB_NAME ?? DEFAULT_SPACETIMEDB_DB_NAME,
    token: process.env.SPACETIMEDB_SERVICE_TOKEN,
  };
}

async function createServerConnection(config: {
  url: string;
  dbName: string;
  token?: string;
}): Promise<DbConnection> {
  return await new Promise<DbConnection>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("SpacetimeDB connection timed out."));
    }, 10000);

    DbConnection.builder()
      .withUri(config.url)
      .withDatabaseName(config.dbName)
      .withToken(config.token)
      .onConnect((conn) => {
        clearTimeout(timeout);
        resolve(conn);
      })
      .onConnectError((_ctx, error) => {
        clearTimeout(timeout);
        reject(error);
      })
      .build();
  });
}

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return true;
  }

  const authHeader = request.headers.get("authorization") ?? "";
  return authHeader === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const config = getServerConfig();

  try {
    const response = await fetch(PRICE_ENDPOINT, {
      headers: {
        accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Price fetch failed with ${response.status}`);
    }

    const payload = (await response.json()) as {
      bitcoin?: { usd?: number };
      ethereum?: { usd?: number };
    };

    const btc = payload.bitcoin?.usd;
    const eth = payload.ethereum?.usd;

    if (typeof btc !== "number" || typeof eth !== "number") {
      throw new Error("Price response payload was incomplete.");
    }

    const conn = await createServerConnection(config);
    const now = Date.now();

    try {
      await conn.reducers.upsertMarketTick({
        symbol: "BTC-USD",
        priceUsd: btc,
        atMs: now,
      });

      await conn.reducers.upsertMarketTick({
        symbol: "ETH-USD",
        priceUsd: eth,
        atMs: now,
      });

      // Keep the MVP lively by continuously generating demo bot predictions.
      await conn.reducers.generateDemoActivity({});
    } finally {
      conn.disconnect();
    }

    return NextResponse.json({
      ok: true,
      atMs: now,
      prices: {
        "BTC-USD": btc,
        "ETH-USD": eth,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
