"use client";

import { FormEvent, useMemo, useState } from "react";

import { useAlgorenaRealtime } from "@/hooks/use-algorena-realtime";

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
    pushManualTick,
  } = useAlgorenaRealtime();

  const [userAlias, setUserAlias] = useState("anon-trader");
  const [symbol, setSymbol] = useState("BTC-USD");
  const [direction, setDirection] = useState<"up" | "down">("up");
  const [horizonMinutes, setHorizonMinutes] = useState(15);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [syncingPrices, setSyncingPrices] = useState(false);

  const symbols = useMemo(() => {
    const fromLive = markets.map((m) => m.symbol);
    return fromLive.length > 0 ? fromLive : ["BTC-USD", "ETH-USD"];
  }, [markets]);

  async function onSubmitPrediction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFeedback(null);

    try {
      await submitPrediction({
        userAlias,
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
        <p className="eyebrow">Algorena MVP</p>
        <h1>Realtime Trading Prediction Arena</h1>
        <p className="hero-copy">
          Submit directional calls, watch the feed settle in realtime, and climb
          the live leaderboard.
        </p>
        <div className="status-row">
          <span className={`pill pill-${status}`}>{statusLabel(status)}</span>
          <span className="mono">
            {connectionInfo.url} / {connectionInfo.dbName}
          </span>
        </div>
        {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
      </header>

      <section className="market-grid">
        {markets.map((market) => (
          <article key={market.symbol} className="panel market-panel">
            <p className="panel-title">{market.symbol}</p>
            <p className="price">{CURRENCY.format(market.priceUsd)}</p>
            <p className="muted">Updated {formatTime(market.updatedAtMs)}</p>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => pushManualTick(market.symbol, market.priceUsd * 1.01)}
              disabled={status !== "connected"}
            >
              Push +1% Tick
            </button>
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
              className="ghost-btn"
              onClick={onFetchLivePrices}
              disabled={syncingPrices}
            >
              {syncingPrices ? "Syncing..." : "Fetch Live Prices"}
            </button>
          </div>
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
        <h2>Prediction Feed</h2>
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
              {predictions.slice(0, 20).map((row) => (
                <tr key={row.id}>
                  <td>{row.userAlias}</td>
                  <td>{row.symbol}</td>
                  <td>{row.direction.toUpperCase()}</td>
                  <td>{CURRENCY.format(row.entryPriceUsd)}</td>
                  <td>{formatTime(row.resolveAtMs)}</td>
                  <td>
                    {row.resolved
                      ? row.correct
                        ? "Won"
                        : "Lost"
                      : "Open"}
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
