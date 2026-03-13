"use client";

import { FormEvent, useState } from "react";

import { formatCompactUsd, formatPercent, formatTokenAmount } from "@/lib/format";
import type { PositionRecord, PositionsResponse } from "@/lib/types";

const DEMO_ADDRESS = "0x0000000000000000000000000000000000000000";

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="card">
      <span className="card-label">{label}</span>
      <div className="card-value">{value}</div>
    </div>
  );
}

function PositionRow({ position }: { position: PositionRecord }) {
  return (
    <tr>
      <td>
        <div className="stack">
          <strong>{position.chain}</strong>
          <span className="pill">{position.protocol}</span>
        </div>
      </td>
      <td>
        <div className="stack">
          <strong>{position.marketName}</strong>
          <span className="muted">{position.assetSymbol}</span>
        </div>
      </td>
      <td>
        <div className="stack">
          <strong>{formatCompactUsd(position.principalUsd)}</strong>
          <span className="muted">{formatTokenAmount(position.principalAsset, position.assetSymbol)}</span>
        </div>
      </td>
      <td>
        <div className="stack">
          <strong>{formatCompactUsd(position.currentUsd)}</strong>
          <span className="muted">{formatTokenAmount(position.currentAsset, position.assetSymbol)}</span>
        </div>
      </td>
      <td>
        <div className="stack">
          <strong>{formatCompactUsd(position.accruedInterestUsd)}</strong>
          <span className="muted">{formatTokenAmount(position.accruedInterestAsset, position.assetSymbol)}</span>
        </div>
      </td>
      <td>
        <div className="stack">
          <strong>{formatPercent(position.annualRate)}</strong>
          <span className="muted">{position.rateType.toUpperCase()}</span>
        </div>
      </td>
      <td>
        <div className="stack">
          <strong>{formatCompactUsd(position.estimatedDailyInterestUsd)}</strong>
          <span className="muted">{formatTokenAmount(position.estimatedDailyInterestAsset, position.assetSymbol)}</span>
        </div>
      </td>
      <td>
        <div className="stack">
          <span className="muted">{new Date(position.sourceTimestamp).toLocaleString()}</span>
          {position.warnings.length > 0 ? (
            <ul className="warning-list">
              {position.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

export default function HomePage() {
  const [address, setAddress] = useState(DEMO_ADDRESS);
  const [data, setData] = useState<PositionsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/positions?address=${address}`);
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to fetch positions.");
      }

      setData(payload);
    } catch (submitError) {
      setData(null);
      setError(submitError instanceof Error ? submitError.message : "Unknown request error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="stack">
          <p className="eyebrow">Cross-Chain Lending View</p>
          <h1>Find lending yield by wallet.</h1>
        </div>
        <p className="hero-copy">
          Enter an EVM address to aggregate Aave v3 and Morpho supply positions across Ethereum,
          Arbitrum, Base, Polygon, and Optimism. Daily interest is estimated from the current rate.
          Accrued interest is shown only when the adapter can reconstruct a principal baseline.
        </p>
        <form className="address-form" onSubmit={handleSubmit}>
          <input
            aria-label="Wallet address"
            className="address-input"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="0x..."
          />
          <button className="submit-button" disabled={loading} type="submit">
            {loading ? "Loading..." : "Analyze"}
          </button>
        </form>
      </section>

      <section className="content-grid">
        {error ? <div className="notice error">{error}</div> : null}

        {data ? (
          <>
            <div className="summary-grid">
              <SummaryCard label="Current Value" value={formatCompactUsd(data.totals.currentUsd)} />
              <SummaryCard label="Principal" value={formatCompactUsd(data.totals.principalUsd)} />
              <SummaryCard label="Accrued Interest" value={formatCompactUsd(data.totals.accruedInterestUsd)} />
              <SummaryCard
                label="Est. Daily Interest"
                value={formatCompactUsd(data.totals.estimatedDailyInterestUsd)}
              />
            </div>

            {data.errors.length > 0 ? (
              <div className="notice">
                Some adapters failed:
                {" "}
                {data.errors.map((item) => `${item.chain}/${item.protocol}: ${item.message}`).join(" | ")}
              </div>
            ) : null}

            <div className="table-panel">
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Chain / Protocol</th>
                      <th>Market</th>
                      <th>Principal</th>
                      <th>Current</th>
                      <th>Accrued</th>
                      <th>Rate</th>
                      <th>Daily</th>
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.positions.map((position) => (
                      <PositionRow key={position.marketId} position={position} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {data.positions.length === 0 ? (
              <div className="notice">No supported Aave v3 or Morpho lending positions were found.</div>
            ) : null}
          </>
        ) : (
          <div className="notice">
            Enter an address and the dashboard will query the supported chains and protocols.
          </div>
        )}
      </section>
    </main>
  );
}

