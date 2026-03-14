"use client";

import { FormEvent, Fragment, useState } from "react";

import { formatCompactUsd, formatPercent, formatTokenAmount } from "@/lib/format";
import type { PositionRecord, PositionsResponse } from "@/lib/types";

const EXAMPLE_ADDRESSES = [
  "0x560B3A85Af1cEF113BB60105d0Cf21e1d05F91d4",
  "0x28966Ce36d0F25858dc5d10DfC2829F05C332C49",
  "0x60b0e610d3A7b754fd8CB71c54d41B4D1C10Ff37",
  "0xA8F94Ec342CE47399B19Ae5CACfBaFdA25058882",
] as const;

function getProtocolUrl(protocol: PositionRecord["protocol"]) {
  switch (protocol) {
    case "aave-v3":
      return "https://app.aave.com/";
    case "morpho":
      return "https://app.morpho.org/";
    case "compound-v3":
      return "https://app.compound.finance/";
  }
}

function ProtocolLink({ position }: { position: PositionRecord }) {
  return (
    <a
      className="protocol-link"
      href={getProtocolUrl(position.protocol)}
      rel="noreferrer"
      target="_blank"
    >
      Open protocol
    </a>
  );
}

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
          <ProtocolLink position={position} />
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
          <div className="stack">
            <strong>{position.marketName}</strong>
            <div className="protocol-row">
              <span className="pill">{position.protocol}</span>
              <ProtocolLink position={position} />
            </div>
          </div>
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
            <h1>How much are you earning?</h1>
          </div>
          <div className="hero-protocols">
            <div className="hero-protocol-group">
              <img src="/logos/aave.svg" alt="Aave" width="28" height="28" />
              <img src="/logos/morpho.svg" alt="Morpho" width="28" height="28" />
              <img src="/logos/compound.svg" alt="Compound" width="28" height="28" />
            </div>
            <span className="hero-protocols-divider" />
            <div className="hero-protocol-group">
              <img src="/logos/ethereum.png" alt="Ethereum" width="22" height="22" />
              <img src="/logos/arbitrum.png" alt="Arbitrum" width="22" height="22" />
              <img src="/logos/base.png" alt="Base" width="22" height="22" />
              <img src="/logos/polygon.png" alt="Polygon" width="22" height="22" />
              <img src="/logos/optimism.png" alt="Optimism" width="22" height="22" />
            </div>
          </div>
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
        {!hasData && !loading ? (
          <button
            className="try-example"
            type="button"
            onClick={() => {
              const randomAddress =
                EXAMPLE_ADDRESSES[Math.floor(Math.random() * EXAMPLE_ADDRESSES.length)];
              setAddress(randomAddress);
              // auto-submit
              setTimeout(() => {
                document.querySelector<HTMLFormElement>(".address-form")?.requestSubmit();
              }, 0);
            }}
          >
            <span className="try-example-icon">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5.5 2L10.5 7L5.5 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </span>
            Try with an example address
          </button>
        ) : null}
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
                        <Fragment key={group.chain}>
                          <tr className="chain-group-header">
                            <td colSpan={7}>{group.chain}</td>
                          </tr>
                          {group.positions.map((position) => (
                            <PositionRow key={position.marketId} position={position} />
                          ))}
                        </Fragment>
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
        <section className="content-grid fade-in">
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><circle cx="10" cy="14" r="8" stroke="currentColor" strokeWidth="2"/><circle cx="18" cy="14" r="8" stroke="currentColor" strokeWidth="2"/></svg>
              </div>
              <h3 className="feature-title">Cross-chain aggregation</h3>
              <p className="feature-desc">Scan Ethereum, Arbitrum, Base, Polygon, and Optimism in a single query.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M4 20L10 14L16 18L24 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M18 8H24V14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <h3 className="feature-title">Accrued interest tracking</h3>
              <p className="feature-desc">Automatically calculate real-time interest earnings from on-chain principal deltas.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><rect x="3" y="6" width="22" height="16" rx="3" stroke="currentColor" strokeWidth="2"/><path d="M3 12H25" stroke="currentColor" strokeWidth="2"/><circle cx="19" cy="18" r="2" fill="currentColor"/></svg>
              </div>
              <h3 className="feature-title">Multi-protocol support</h3>
              <p className="feature-desc">Unified view of positions across Aave v3, Morpho, and Compound v3.</p>
            </div>
          </div>

        </section>
      ) : null}
    </main>
  );
}
