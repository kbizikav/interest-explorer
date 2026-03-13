export function roundNumber(value: number | null, digits = 2) {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function formatCompactUsd(value: number | null) {
  if (value === null) {
    return "N/A";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: Math.abs(value) >= 1000 ? "compact" : "standard",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number | null) {
  if (value === null) {
    return "N/A";
  }

  return `${(value * 100).toFixed(2)}%`;
}

export function formatTokenAmount(value: number | null, symbol: string) {
  if (value === null) {
    return "N/A";
  }

  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 6,
  }).format(value)} ${symbol}`;
}

