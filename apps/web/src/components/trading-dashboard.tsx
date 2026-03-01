"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { useAlgorenaRealtime } from "@/hooks/use-algorena-realtime";

const FEED_PREVIEW_COUNT = 5;

const CURRENCY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

function formatTime(ms: number): string {
  if (!Number.isFinite(ms)) {
    return "-";
  }

  return new Date(ms).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function statusLabel(status: string): string {
  switch (status) {
    case "connected":
      return "Connected";
    case "connecting":
      return "Connecting";
    case "disconnected":
      return "Disconnected";
    default:
      return "Error";
  }
}

export function TradingDashboard() {
  const {
    status,
    errorMessage,
    connectionInfo,
    markets,
    predictions,
    leaderboard,
    submitPrediction,
  } = useAlgorenaRealtime();

  const [userAlias, setUserAlias] = useState("anon-trader");
  const [symbol, setSymbol] = useState("BTC-USD");
  const [direction, setDirection] = useState<"up" | "down">("up");
  const [horizonMinutes, setHorizonMinutes] = useState(15);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [syncingPrices, setSyncingPrices] = useState(false);
  const [showAllPredictions, setShowAllPredictions] = useState(false);

  const symbols = useMemo(() => {
    const fromLive = markets.map((m) => m.symbol);
    return fromLive.length > 0 ? fromLive : ["BTC-USD", "ETH-USD"];
  }, [markets]);

  const trimmedAlias = userAlias.trim();
  const normalizedAlias = trimmedAlias.toLowerCase();

  const hasDuplicateOpenPrediction = useMemo(() => {
    return predictions.some(
      (row) =>
        !row.resolved &&
        row.userAlias.trim().toLowerCase() === normalizedAlias &&
        row.symbol === symbol &&
        row.direction === direction &&
        row.horizonMinutes === horizonMinutes
    );
  }, [direction, horizonMinutes, normalizedAlias, predictions, symbol]);

  const visiblePredictions = useMemo(() => {
    return showAllPredictions
      ? predictions
      : predictions.slice(0, FEED_PREVIEW_COUNT);
  }, [predictions, showAllPredictions]);

  const openPredictions = useMemo(
    () => predictions.filter((row) => !row.resolved).length,
    [predictions]
  );
  const settledPredictions = predictions.length - openPredictions;
  const topScore = leaderboard[0]?.score ?? 0;

  useEffect(() => {
    const runAutoSync = () => {
      void fetch("/api/ingest", { cache: "no-store" }).catch(() => undefined);
    };

    runAutoSync();
    const intervalId = window.setInterval(runAutoSync, 45_000);
    return () => window.clearInterval(intervalId);
  }, []);

  async function onSubmitPrediction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (hasDuplicateOpenPrediction) {
      setFeedback(
        "Duplicate open prediction: you already have this exact call active."
      );
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      await submitPrediction({
        userAlias: trimmedAlias,
        symbol,
        direction,
        horizonMinutes,
      });
      setFeedback("Prediction submitted.");
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Prediction submission failed."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function onFetchLivePrices() {
    setSyncingPrices(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/ingest");
      const payload = (await response.json()) as { ok?: boolean; error?: string };

      if (!response.ok || payload.ok !== true) {
        throw new Error(payload.error ?? "Could not ingest live prices.");
      }

      setFeedback("Market prices synced from CoinGecko.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Price sync failed.");
    } finally {
      setSyncingPrices(false);
    }
  }

  return (
    <div className="dashboard-shell">
      <header className="hero-card">
        <div className="hero-top-row">
          <div className="logo-lockup">
            <p className="wordmark" aria-label="Algorena">
              <span className="wordmark-muted">ALGO</span>
              <span className="wordmark-live" data-text="RENA">
                RENA
              </span>
            </p>
            <p className="logo-subtitle">Realtime Prediction Exchange</p>
          </div>
          <span className={`pill pill-${status}`}>{statusLabel(status)}</span>
        </div>
        <h1>Trade conviction. Track outcomes. Climb the board.</h1>
        <p className="hero-copy">
          Submit directional calls, follow live market ticks, and watch every
          prediction resolve into a ranked score.
        </p>
        <div className="hero-meta">
          <p className="mono">Endpoint: {connectionInfo.url}</p>
          <p className="mono">Database: {connectionInfo.dbName}</p>
        </div>
        {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
      </header>

      <section className="kpi-grid">
        <article className="kpi-card">
          <p className="kpi-label">Open Calls</p>
          <p className="kpi-value">{openPredictions}</p>
        </article>
        <article className="kpi-card">
          <p className="kpi-label">Settled Calls</p>
          <p className="kpi-value">{settledPredictions}</p>
        </article>
        <article className="kpi-card">
          <p className="kpi-label">Top Score</p>
          <p className="kpi-value">{topScore}</p>
        </article>
        <article className="kpi-card">
          <p className="kpi-label">Active Traders</p>
          <p className="kpi-value">{leaderboard.length}</p>
        </article>
      </section>

      <section className="market-grid">
        {markets.map((market) => (
          <article key={market.symbol} className="panel market-panel">
            <p className="panel-title">{market.symbol}</p>
            <p className="price">{CURRENCY.format(market.priceUsd)}</p>
            <p className="muted">Updated {formatTime(market.updatedAtMs)}</p>
          </article>
        ))}
        {markets.length === 0 ? (
          <article className="panel market-panel">
            <p className="panel-title">Waiting for market stream...</p>
            <p className="muted">
              Publish the module and connect this app to your Maincloud database.
            </p>
          </article>
        ) : null}
      </section>

      <section className="content-grid">
        <article className="panel">
          <div className="panel-header">
            <h2>Submit Prediction</h2>
            <button
              type="button"
              className="ghost-btn ghost-btn-sync"
              onClick={onFetchLivePrices}
              disabled={syncingPrices}
            >
              {syncingPrices ? "Syncing..." : "Fetch Live Prices"}
            </button>
          </div>
          <p className="muted">Demo autopilot sync runs every 45 seconds.</p>
          <form className="form-stack" onSubmit={onSubmitPrediction}>
            <label>
              Alias
              <input
                value={userAlias}
                onChange={(event) => setUserAlias(event.target.value)}
                minLength={2}
                maxLength={24}
                required
              />
            </label>
            <label>
              Symbol
              <select
                value={symbol}
                onChange={(event) => setSymbol(event.target.value)}
              >
                {symbols.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Direction
              <select
                value={direction}
                onChange={(event) =>
                  setDirection(event.target.value as "up" | "down")
                }
              >
                <option value="up">Up</option>
                <option value="down">Down</option>
              </select>
            </label>
            <label>
              Horizon (minutes)
              <input
                type="number"
                min={1}
                max={240}
                value={horizonMinutes}
                onChange={(event) =>
                  setHorizonMinutes(Number(event.target.value) || 1)
                }
              />
            </label>
            <button
              type="submit"
              className="primary-btn"
              disabled={submitting || status !== "connected"}
            >
              {submitting ? "Submitting..." : "Submit"}
            </button>
          </form>
          {feedback ? <p className="feedback">{feedback}</p> : null}
        </article>

        <article className="panel">
          <h2>Live Leaderboard</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Trader</th>
                  <th>Score</th>
                  <th>W-L</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((row) => (
                  <tr key={row.userAlias}>
                    <td>{row.userAlias}</td>
                    <td>{row.score}</td>
                    <td>
                      {row.wins}-{row.losses}
                    </td>
                    <td>{row.total}</td>
                  </tr>
                ))}
                {leaderboard.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="muted">
                      No resolved predictions yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Prediction Feed</h2>
          {predictions.length > FEED_PREVIEW_COUNT ? (
            <button
              type="button"
              className="ghost-btn ghost-btn-explore"
              onClick={() => setShowAllPredictions((current) => !current)}
            >
              {showAllPredictions
                ? "Show top 5"
                : `Explore all (${predictions.length - FEED_PREVIEW_COUNT} more)`}
            </button>
          ) : null}
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Trader</th>
                <th>Pair</th>
                <th>Call</th>
                <th>Entry</th>
                <th>Resolve</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {visiblePredictions.map((row) => (
                <tr key={row.id}>
                  <td>{row.userAlias}</td>
                  <td>{row.symbol}</td>
                  <td>
                    <span className={`call-chip call-${row.direction}`}>
                      {row.direction.toUpperCase()}
                    </span>
                  </td>
                  <td>{CURRENCY.format(row.entryPriceUsd)}</td>
                  <td>{formatTime(row.resolveAtMs)}</td>
                  <td>
                    <span
                      className={`status-chip ${
                        row.resolved
                          ? row.correct
                            ? "status-won"
                            : "status-lost"
                          : "status-open"
                      }`}
                    >
                      {row.resolved ? (row.correct ? "Won" : "Lost") : "Open"}
                    </span>
                  </td>
                </tr>
              ))}
              {predictions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted">
                    Submit the first prediction.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
