"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { clientSpacetimeConfig, SPACETIME_TOKEN_STORAGE_KEY } from "@/lib/spacetime/config";
import { DbConnection } from "@/lib/spacetime/module_bindings";

export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

export type MarketStateRow = {
  symbol: string;
  priceUsd: number;
  updatedAtMs: number;
};

export type PredictionRow = {
  id: number;
  userAlias: string;
  symbol: string;
  direction: "up" | "down";
  horizonMinutes: number;
  entryPriceUsd: number;
  createdAtMs: number;
  resolveAtMs: number;
  resolved: boolean;
  correct: boolean;
};

export type LeaderboardRow = {
  userAlias: string;
  score: number;
  wins: number;
  losses: number;
  total: number;
};

type SubmitPredictionInput = {
  userAlias: string;
  symbol: string;
  direction: "up" | "down";
  horizonMinutes: number;
};

function toMarketRows(conn: DbConnection): MarketStateRow[] {
  return Array.from(conn.db.marketState.iter())
    .map((row) => ({
      symbol: row.symbol,
      priceUsd: Number(row.priceUsd),
      updatedAtMs: Number(row.updatedAtMs),
    }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
}

function toPredictionRows(conn: DbConnection): PredictionRow[] {
  return Array.from(conn.db.prediction.iter())
    .map((row) => ({
      id: Number(row.id),
      userAlias: row.userAlias,
      symbol: row.symbol,
      direction: row.direction as "up" | "down",
      horizonMinutes: Number(row.horizonMinutes),
      entryPriceUsd: Number(row.entryPriceUsd),
      createdAtMs: Number(row.createdAtMs),
      resolveAtMs: Number(row.resolveAtMs),
      resolved: row.resolved,
      correct: row.correct,
    }))
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
}

function toLeaderboardRows(conn: DbConnection): LeaderboardRow[] {
  return Array.from(conn.db.leaderboard.iter())
    .map((row) => ({
      userAlias: row.userAlias,
      score: Number(row.score),
      wins: Number(row.wins),
      losses: Number(row.losses),
      total: Number(row.total),
    }))
    .sort((a, b) => b.score - a.score);
}

export function useAlgorenaRealtime() {
  const connectionRef = useRef<DbConnection | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [markets, setMarkets] = useState<MarketStateRow[]>([]);
  const [predictions, setPredictions] = useState<PredictionRow[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);

  const syncFromConnection = useCallback((conn: DbConnection) => {
    setMarkets(toMarketRows(conn));
    setPredictions(toPredictionRows(conn));
    setLeaderboard(toLeaderboardRows(conn));
  }, []);

  useEffect(() => {
    let disposed = false;

    const storedToken =
      typeof window === "undefined"
        ? undefined
        : window.localStorage.getItem(SPACETIME_TOKEN_STORAGE_KEY) ?? undefined;

    const conn = DbConnection.builder()
      .withUri(clientSpacetimeConfig.url)
      .withDatabaseName(clientSpacetimeConfig.dbName)
      .withToken(storedToken)
      .onConnect((_connection, _identity, token) => {
        if (disposed) {
          return;
        }

        if (typeof window !== "undefined") {
          window.localStorage.setItem(SPACETIME_TOKEN_STORAGE_KEY, token);
        }

        setStatus("connected");
        setErrorMessage(null);
      })
      .onConnectError((_ctx, error) => {
        if (disposed) {
          return;
        }

        setStatus("error");
        setErrorMessage(error.message);
      })
      .onDisconnect((_ctx, error) => {
        if (disposed) {
          return;
        }

        setStatus("disconnected");
        if (error) {
          setErrorMessage(error.message);
        }
      })
      .build();

    connectionRef.current = conn;

    const onTableChange = () => {
      syncFromConnection(conn);
    };

    const subscription = conn
      .subscriptionBuilder()
      .onApplied(() => {
        if (disposed) {
          return;
        }

        setStatus("connected");
        syncFromConnection(conn);
      })
      .onError(() => {
        if (disposed) {
          return;
        }

        setStatus("error");
        setErrorMessage("Subscription error while syncing realtime data.");
      })
      .subscribe([
        "SELECT * FROM marketState",
        "SELECT * FROM prediction",
        "SELECT * FROM leaderboard",
      ]);

    conn.db.marketState.onInsert(onTableChange);
    conn.db.marketState.onDelete(onTableChange);
    conn.db.marketState.onUpdate(onTableChange);

    conn.db.prediction.onInsert(onTableChange);
    conn.db.prediction.onDelete(onTableChange);
    conn.db.prediction.onUpdate(onTableChange);

    conn.db.leaderboard.onInsert(onTableChange);
    conn.db.leaderboard.onDelete(onTableChange);
    conn.db.leaderboard.onUpdate(onTableChange);

    return () => {
      disposed = true;

      subscription.unsubscribe();

      conn.db.marketState.removeOnInsert(onTableChange);
      conn.db.marketState.removeOnDelete(onTableChange);
      conn.db.marketState.removeOnUpdate(onTableChange);

      conn.db.prediction.removeOnInsert(onTableChange);
      conn.db.prediction.removeOnDelete(onTableChange);
      conn.db.prediction.removeOnUpdate(onTableChange);

      conn.db.leaderboard.removeOnInsert(onTableChange);
      conn.db.leaderboard.removeOnDelete(onTableChange);
      conn.db.leaderboard.removeOnUpdate(onTableChange);

      conn.disconnect();
      connectionRef.current = null;
    };
  }, [syncFromConnection]);

  const submitPrediction = useCallback(
    async (payload: SubmitPredictionInput) => {
      const conn = connectionRef.current;
      if (!conn || status !== "connected") {
        throw new Error("Not connected to SpacetimeDB");
      }

      await conn.reducers.submitPrediction({
        userAlias: payload.userAlias.trim(),
        symbol: payload.symbol,
        direction: payload.direction,
        horizonMinutes: payload.horizonMinutes,
      });
    },
    [status]
  );

  const pushManualTick = useCallback(
    async (symbol: string, priceUsd: number) => {
      const conn = connectionRef.current;
      if (!conn || status !== "connected") {
        throw new Error("Not connected to SpacetimeDB");
      }

      await conn.reducers.upsertMarketTick({
        symbol,
        priceUsd,
        atMs: Date.now(),
      });
    },
    [status]
  );

  const connectionInfo = useMemo(
    () => ({
      url: clientSpacetimeConfig.url,
      dbName: clientSpacetimeConfig.dbName,
    }),
    []
  );

  return {
    status,
    errorMessage,
    connectionInfo,
    markets,
    predictions,
    leaderboard,
    submitPrediction,
    pushManualTick,
  };
}
