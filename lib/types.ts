export type ProtocolName = "aave-v3" | "morpho";

export type PositionRecord = {
  chain: string;
  protocol: ProtocolName;
  marketId: string;
  marketName: string;
  assetAddress: string;
  assetSymbol: string;
  principalAsset: number | null;
  principalUsd: number | null;
  currentAsset: number;
  currentUsd: number;
  accruedInterestAsset: number | null;
  accruedInterestUsd: number | null;
  rateType: "apr" | "apy";
  annualRate: number | null;
  estimatedDailyInterestAsset: number | null;
  estimatedDailyInterestUsd: number | null;
  sourceTimestamp: string;
  warnings: string[];
};

export type PositionsResponse = {
  address: string;
  totals: {
    principalUsd: number | null;
    currentUsd: number;
    accruedInterestUsd: number | null;
    estimatedDailyInterestUsd: number | null;
  };
  positions: PositionRecord[];
  errors: {
    chain: string;
    protocol: ProtocolName;
    message: string;
  }[];
  generatedAt: string;
};

