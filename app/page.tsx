"use client";

import { FormEvent, useState } from "react";

import { formatCompactUsd, formatPercent, formatTokenAmount } from "@/lib/format";
import type { PositionRecord, PositionsResponse } from "@/lib/types";

function SummaryCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className={`card${highlight ? " highlight" : ""}`}>
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
          <span className="pill">{position.protocol}</span>
        </div>
      </td>
      <td>
        <div className="stack">
          <strong>{position.marketName}</strong>
          <span className="muted">{position.assetSymbol}</span>
        </div>
      </td>
      <td>{formatCompactUsd(position.currentUsd)}</td>
      <td className="positive">
        <div className="stack">
          <strong>{formatCompactUsd(position.accruedInterestUsd)}</strong>
          <span className="muted">{formatTokenAmount(position.accruedInterestAsset, position.assetSymbol)}</span>
        </div>
      </td>
      <td>{formatPercent(position.annualRate)}</td>
      <td className="positive">
        <div className="stack">
          <strong>{formatCompactUsd(position.estimatedDailyInterestUsd)}</strong>
          <span className="muted">{formatTokenAmount(position.estimatedDailyInterestAsset, position.assetSymbol)}</span>
        </div>
      </td>
      <td>
        <span className="muted">{new Date(position.sourceTimestamp).toLocaleDateString()}</span>
        {position.warnings.length > 0 ? (
          <ul className="warning-list">
            {position.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}
      </td>
    </tr>
  );
}

function PositionCard({ position }: { position: PositionRecord }) {
  return (
    <div className="position-card">
      <div className="position-card-header">
        <div className="position-card-header-left">
          <strong>{position.marketName}</strong>
          <span className="pill">{position.protocol}</span>
        </div>
        <span className="muted">{position.assetSymbol}</span>
      </div>
      <div className="position-card-grid">
        <div className="position-card-field">
          <span className="position-card-field-label">Current</span>
          <span className="position-card-field-value">{formatCompactUsd(position.currentUsd)}</span>
        </div>
        <div className="position-card-field">
          <span className="position-card-field-label">Rate</span>
          <span className="position-card-field-value">{formatPercent(position.annualRate)}</span>
        </div>
        <div className="position-card-field">
          <span className="position-card-field-label">Accrued</span>
          <span className="position-card-field-value positive">{formatCompactUsd(position.accruedInterestUsd)}</span>
        </div>
        <div className="position-card-field">
          <span className="position-card-field-label">Daily</span>
          <span className="position-card-field-value positive">{formatCompactUsd(position.estimatedDailyInterestUsd)}</span>
        </div>
      </div>
    </div>
  );
}

/** Group positions by chain, preserving order of first appearance. */
function groupByChain(positions: PositionRecord[]) {
  const groups: { chain: string; positions: PositionRecord[] }[] = [];
  const index = new Map<string, number>();

  for (const p of positions) {
    const existing = index.get(p.chain);
    if (existing !== undefined) {
      groups[existing].positions.push(p);
    } else {
      index.set(p.chain, groups.length);
      groups.push({ chain: p.chain, positions: [p] });
    }
  }

  return groups;
}

function LoadingSkeleton() {
  return (
    <div className="content-grid fade-in">
      <div className="skeleton-grid">
        <div className="skeleton-card" />
        <div className="skeleton-card" />
        <div className="skeleton-card" />
        <div className="skeleton-card" />
      </div>
      <div className="skeleton-table" />
    </div>
  );
}

export default function HomePage() {
  const [address, setAddress] = useState("");
  const [data, setData] = useState<PositionsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const hasData = data !== null;

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

  const groups = data ? groupByChain(data.positions) : [];

  return (
    <main className="page-shell">
      <section className={`hero${hasData ? " compact" : ""}`}>
        <div className="hero-intro">
          <div className="stack">
            <p className="eyebrow">LendScope</p>
            <h1>Track lending positions by wallet.</h1>
          </div>
          <p className="hero-copy">
            Enter an EVM address to aggregate supply positions across
            Aave v3, Morpho, and Compound v3 on Ethereum, Arbitrum, Base, Polygon, and Optimism.
          </p>
        </div>
        <form className="address-form" onSubmit={handleSubmit}>
          <input
            aria-label="Wallet address"
            className="address-input"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="0x..."
          />
          <button className="submit-button" disabled={loading} type="submit">
            {loading ? "Loading…" : hasData ? "Refresh" : "Analyze"}
          </button>
        </form>
      </section>

      {error ? (
        <section className="content-grid">
          <div className="notice error">{error}</div>
        </section>
      ) : null}

      {loading ? <LoadingSkeleton /> : null}

      {data && !loading ? (
        <section className="content-grid fade-in">
          <div className="summary-grid">
            <SummaryCard label="Current Value" value={formatCompactUsd(data.totals.currentUsd)} />
            <SummaryCard label="Principal" value={formatCompactUsd(data.totals.principalUsd)} />
            <SummaryCard
              label="Accrued Interest"
              value={formatCompactUsd(data.totals.accruedInterestUsd)}
              highlight
            />
            <SummaryCard
              label="Est. Daily Interest"
              value={formatCompactUsd(data.totals.estimatedDailyInterestUsd)}
              highlight
            />
          </div>

          {data.errors.length > 0 ? (
            <div className="notice">
              Some adapters failed:{" "}
              {data.errors.map((item) => `${item.chain}/${item.protocol}: ${item.message}`).join(" | ")}
            </div>
          ) : null}

          {data.positions.length > 0 ? (
            <>
              {/* Desktop table */}
              <div className="table-panel">
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Protocol</th>
                        <th>Market</th>
                        <th>Current</th>
                        <th>Accrued</th>
                        <th>Rate</th>
                        <th>Daily</th>
                        <th>Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groups.map((group) => (
                        <>
                          <tr key={`chain-${group.chain}`} className="chain-group-header">
                            <td colSpan={7}>{group.chain}</td>
                          </tr>
                          {group.positions.map((position) => (
                            <PositionRow key={position.marketId} position={position} />
                          ))}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile cards */}
              <div className="position-cards">
                {groups.map((group) => (
                  <div key={`mobile-${group.chain}`}>
                    <div className="notice" style={{ marginBottom: 8, fontWeight: 600, fontSize: "0.82rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      {group.chain}
                    </div>
                    {group.positions.map((position) => (
                      <PositionCard key={position.marketId} position={position} />
                    ))}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="notice">No supported lending positions were found for this address.</div>
          )}
        </section>
      ) : null}

      {!data && !loading && !error ? (
        <section className="content-grid">
          <div className="notice">
            Enter a wallet address to view lending positions and yield across supported chains.
          </div>
        </section>
      ) : null}
    </main>
  );
}
