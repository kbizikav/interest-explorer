"use client";

import { FormEvent, Fragment, Suspense, useRef, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

import { formatCompactUsd, formatPercent, formatTokenAmount } from "@/lib/format";
import { resolveLocale, getTranslations, SUPPORTED_LOCALES, LOCALE_LABELS, type Locale, type Translations } from "@/lib/i18n";
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

function LangSwitcher({ locale }: { locale: Locale }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  function handleSelect(newLocale: Locale) {
    setOpen(false);
    const params = new URLSearchParams(window.location.search);
    if (newLocale === "en") {
      params.delete("lang");
    } else {
      params.set("lang", newLocale);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="lang-switcher" ref={ref}>
      <button
        className="lang-switcher-btn"
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={(e) => {
          if (!ref.current?.contains(e.relatedTarget)) setOpen(false);
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2"/>
          <ellipse cx="8" cy="8" rx="3" ry="6.5" stroke="currentColor" strokeWidth="1.2"/>
          <path d="M1.5 8H14.5" stroke="currentColor" strokeWidth="1.2"/>
        </svg>
        <span className="lang-switcher-label">{LOCALE_LABELS[locale]}</span>
      </button>
      {open ? (
        <div className="lang-dropdown">
          {SUPPORTED_LOCALES.map((loc) => (
            <button
              key={loc}
              className={`lang-dropdown-item${loc === locale ? " active" : ""}`}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(loc)}
            >
              {LOCALE_LABELS[loc]}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ProtocolPill({ position }: { position: PositionRecord }) {
  return (
    <a
      className="pill pill-link"
      href={getProtocolUrl(position.protocol)}
      rel="noreferrer"
      target="_blank"
    >
      {position.protocol}
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
        <path d="M3.5 2H10V8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
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
        <ProtocolPill position={position} />
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
    </tr>
  );
}

function PositionCard({ position, t }: { position: PositionRecord; t: Translations }) {
  return (
    <div className="position-card">
      <div className="position-card-header">
        <div className="position-card-header-left">
          <div className="stack">
            <strong>{position.marketName}</strong>
            <ProtocolPill position={position} />
          </div>
        </div>
        <span className="muted">{position.assetSymbol}</span>
      </div>
      <div className="position-card-grid">
        <div className="position-card-field">
          <span className="position-card-field-label">{t.thCurrent}</span>
          <span className="position-card-field-value">{formatCompactUsd(position.currentUsd)}</span>
        </div>
        <div className="position-card-field">
          <span className="position-card-field-label">{t.thRate}</span>
          <span className="position-card-field-value">{formatPercent(position.annualRate)}</span>
        </div>
        <div className="position-card-field">
          <span className="position-card-field-label">{t.thAccrued}</span>
          <span className="position-card-field-value positive">{formatCompactUsd(position.accruedInterestUsd)}</span>
        </div>
        <div className="position-card-field">
          <span className="position-card-field-label">{t.thDaily}</span>
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

function HomePageInner() {
  const searchParams = useSearchParams();
  const locale = resolveLocale(searchParams.get("lang"));
  const t = getTranslations(locale);

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

  function handleReset() {
    setData(null);
    setError(null);
    setAddress("");
  }

  return (
    <main className="page-shell">
      {hasData ? (
        <header className="site-header">
          <button className="site-header-logo" type="button" onClick={handleReset}>
            <svg width="20" height="20" viewBox="0 0 28 28" fill="none">
              <path d="M4 20L10 14L16 18L24 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M18 8H24V14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {t.appName}
          </button>
          <form className="site-header-form" onSubmit={handleSubmit}>
            <input
              aria-label="Wallet address"
              className="site-header-input"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="0x..."
            />
            <button className="site-header-refresh" disabled={loading} type="submit">
              {loading ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="spin">
                  <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="8" strokeLinecap="round"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M13.5 2.5V6H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M2.5 13.5V10H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M3.5 6A5.5 5.5 0 0 1 13 5L13.5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M12.5 10A5.5 5.5 0 0 1 3 11L2.5 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>
          </form>
          <LangSwitcher locale={locale} />
        </header>
      ) : (
        <>
        <header className="site-header">
          <span className="site-header-logo">
            <svg width="20" height="20" viewBox="0 0 28 28" fill="none">
              <path d="M4 20L10 14L16 18L24 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M18 8H24V14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {t.appName}
          </span>
          <LangSwitcher locale={locale} />
        </header>
        <section className="hero">
          <div className="hero-intro">
            <h1>{t.heroHeadline}</h1>
            <div className="hero-protocols">
              <div className="hero-protocol-group">
                <span className="hero-group-label">{t.protocols}</span>
                <img src="/logos/aave.svg" alt="Aave" width="28" height="28" />
                <img src="/logos/morpho.svg" alt="Morpho" width="28" height="28" />
                <img src="/logos/compound.svg" alt="Compound" width="28" height="28" />
              </div>
              <span className="hero-protocols-divider" />
              <div className="hero-protocol-group">
                <span className="hero-group-label">{t.chains}</span>
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
              {loading ? t.loading : t.analyze}
            </button>
          </form>
          {!loading ? (
            <button
              className="try-example"
              type="button"
              onClick={() => {
                const randomAddress =
                  EXAMPLE_ADDRESSES[Math.floor(Math.random() * EXAMPLE_ADDRESSES.length)];
                setAddress(randomAddress);
                setTimeout(() => {
                  document.querySelector<HTMLFormElement>(".address-form")?.requestSubmit();
                }, 0);
              }}
            >
              <span className="try-example-icon">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5.5 2L10.5 7L5.5 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </span>
              {t.tryExample}
            </button>
          ) : null}
        </section>
        </>
      )}

      {error ? (
        <section className="content-grid">
          <div className="notice error">{error}</div>
        </section>
      ) : null}

      {loading ? <LoadingSkeleton /> : null}

      {data && !loading ? (
        <section className="content-grid fade-in">
          <div className="summary-grid">
            <SummaryCard label={t.currentValue} value={formatCompactUsd(data.totals.currentUsd)} />
            <SummaryCard label={t.principal} value={formatCompactUsd(data.totals.principalUsd)} />
            <SummaryCard
              label={t.accruedInterest}
              value={formatCompactUsd(data.totals.accruedInterestUsd)}
              highlight
            />
            <SummaryCard
              label={t.estDailyInterest}
              value={formatCompactUsd(data.totals.estimatedDailyInterestUsd)}
              highlight
            />
          </div>

          {data.errors.length > 0 ? (
            <div className="notice">
              {t.adaptersFailed}{" "}
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
                        <th>{t.thProtocol}</th>
                        <th>{t.thMarket}</th>
                        <th>{t.thCurrent}</th>
                        <th>{t.thAccrued}</th>
                        <th>{t.thRate}</th>
                        <th>{t.thDaily}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groups.map((group) => (
                        <Fragment key={group.chain}>
                          <tr className="chain-group-header">
                            <td colSpan={6}>{group.chain}</td>
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
                      <PositionCard key={position.marketId} position={position} t={t} />
                    ))}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="notice">{t.noPositions}</div>
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
              <h3 className="feature-title">{t.featureCrossChainTitle}</h3>
              <p className="feature-desc">{t.featureCrossChainDesc}</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M4 20L10 14L16 18L24 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M18 8H24V14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <h3 className="feature-title">{t.featureInterestTitle}</h3>
              <p className="feature-desc">{t.featureInterestDesc}</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><rect x="3" y="6" width="22" height="16" rx="3" stroke="currentColor" strokeWidth="2"/><path d="M3 12H25" stroke="currentColor" strokeWidth="2"/><circle cx="19" cy="18" r="2" fill="currentColor"/></svg>
              </div>
              <h3 className="feature-title">{t.featureMultiTitle}</h3>
              <p className="feature-desc">{t.featureMultiDesc}</p>
            </div>
          </div>

        </section>
      ) : null}
    </main>
  );
}

export default function HomePage() {
  return (
    <Suspense>
      <HomePageInner />
    </Suspense>
  );
}
