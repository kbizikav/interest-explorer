import { isAddress } from "viem";

import { SUPPORTED_CHAINS } from "@/lib/chains";
import { withTimeout } from "@/lib/async";
import { roundNumber } from "@/lib/format";
import type { PositionRecord } from "@/lib/types";

const MORPHO_ENDPOINT = "https://api.morpho.org/graphql";
const CHAIN_TIMEOUT_MS = 8_000;

const MORPHO_QUERY = `
  query MorphoPositions($address: String!, $chainId: Int!) {
    userByAddress(address: $address, chainId: $chainId) {
      marketPositions {
        market {
          uniqueKey
          loanAsset {
            address
            symbol
          }
          state {
            supplyApy
          }
        }
        state {
          supplyAssets
          supplyAssetsUsd
        }
      }
      vaultPositions {
        vault {
          address
          name
          asset {
            address
            symbol
          }
          state {
            netApy
          }
        }
        state {
          assets
          assetsUsd
          pnl
          pnlUsd
        }
      }
    }
  }
`;

type MorphoResponse = {
  data?: {
    userByAddress: {
      marketPositions: Array<{
        market: {
          uniqueKey: string;
          loanAsset: {
            address: string;
            symbol: string;
          };
          state: {
            supplyApy: number | null;
          };
        };
        state: {
          supplyAssets: string | null;
          supplyAssetsUsd: number | null;
        };
      }>;
      vaultPositions: Array<{
        vault: {
          address: string;
          name: string;
          asset: {
            address: string;
            symbol: string;
          };
          state: {
            netApy: number | null;
          };
        };
        state: {
          assets: string | null;
          assetsUsd: number | null;
          pnl: string | null;
          pnlUsd: number | null;
        };
      }>;
    };
  };
  errors?: Array<{ message: string }>;
};

async function fetchMorphoChainPositions(chainId: number, address: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CHAIN_TIMEOUT_MS);
  const response = await fetch(MORPHO_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    signal: controller.signal,
    body: JSON.stringify({
      query: MORPHO_QUERY,
      variables: {
        address,
        chainId,
      },
    }),
    next: {
      revalidate: 300,
    },
  }).finally(() => {
    clearTimeout(timeoutId);
  });

  if (!response.ok) {
    throw new Error(`Morpho API failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as MorphoResponse;

  if (payload.errors?.length) {
    const message = payload.errors.map((error) => error.message).join("; ");

    if (message.includes("No results matching given parameters")) {
      return null;
    }

    throw new Error(message);
  }

  return payload.data?.userByAddress;
}

export async function fetchMorphoPositions(address: string) {
  if (!isAddress(address)) {
    throw new Error("Invalid EVM address.");
  }

  const results = await Promise.allSettled(
    SUPPORTED_CHAINS.map(async (chain) => {
      const data = await withTimeout(
        fetchMorphoChainPositions(chain.id, address),
        CHAIN_TIMEOUT_MS,
        `Morpho adapter timed out on ${chain.name}.`,
      );
      const positions: PositionRecord[] = [];

      for (const marketPosition of data?.marketPositions ?? []) {
        const currentAsset = Number(marketPosition.state.supplyAssets ?? "0");
        const currentUsd = marketPosition.state.supplyAssetsUsd ?? 0;
        const annualRate = marketPosition.market.state.supplyApy;

        if (currentAsset <= 0 || currentUsd <= 0) {
          continue;
        }

        positions.push({
          chain: chain.name,
          protocol: "morpho",
          marketId: `${chain.slug}:${marketPosition.market.uniqueKey}`,
          marketName: "Morpho Market",
          assetAddress: marketPosition.market.loanAsset.address,
          assetSymbol: marketPosition.market.loanAsset.symbol,
          principalAsset: null,
          principalUsd: null,
          currentAsset: roundNumber(currentAsset, 6) ?? 0,
          currentUsd: roundNumber(currentUsd, 2) ?? 0,
          accruedInterestAsset: null,
          accruedInterestUsd: null,
          rateType: "apy",
          annualRate: roundNumber(annualRate, 6),
          estimatedDailyInterestAsset: annualRate === null ? null : roundNumber(currentAsset * annualRate / 365, 8),
          estimatedDailyInterestUsd: annualRate === null ? null : roundNumber(currentUsd * annualRate / 365, 4),
          sourceTimestamp: new Date().toISOString(),
          warnings: [
            "Morpho market principal is not exposed in the Phase 1 adapter, so accrued interest is unavailable.",
          ],
        });
      }

      for (const vaultPosition of data?.vaultPositions ?? []) {
        const currentAsset = Number(vaultPosition.state.assets ?? "0");
        const currentUsd = vaultPosition.state.assetsUsd ?? 0;
        const accruedInterestAsset = vaultPosition.state.pnl === null ? null : Number(vaultPosition.state.pnl);
        const accruedInterestUsd = vaultPosition.state.pnlUsd;
        const principalAsset =
          accruedInterestAsset === null ? null : currentAsset - accruedInterestAsset;
        const principalUsd =
          accruedInterestUsd === null ? null : currentUsd - accruedInterestUsd;
        const annualRate = vaultPosition.vault.state.netApy;

        if (currentAsset <= 0 || currentUsd <= 0) {
          continue;
        }

        positions.push({
          chain: chain.name,
          protocol: "morpho",
          marketId: `${chain.slug}:${vaultPosition.vault.address}`,
          marketName: vaultPosition.vault.name,
          assetAddress: vaultPosition.vault.asset.address,
          assetSymbol: vaultPosition.vault.asset.symbol,
          principalAsset: roundNumber(principalAsset, 6),
          principalUsd: roundNumber(principalUsd, 2),
          currentAsset: roundNumber(currentAsset, 6) ?? 0,
          currentUsd: roundNumber(currentUsd, 2) ?? 0,
          accruedInterestAsset: roundNumber(accruedInterestAsset, 6),
          accruedInterestUsd: roundNumber(accruedInterestUsd, 2),
          rateType: "apy",
          annualRate: roundNumber(annualRate, 6),
          estimatedDailyInterestAsset: annualRate === null ? null : roundNumber(currentAsset * annualRate / 365, 8),
          estimatedDailyInterestUsd: annualRate === null ? null : roundNumber(currentUsd * annualRate / 365, 4),
          sourceTimestamp: new Date().toISOString(),
          warnings: [],
        });
      }

      return {
        chain: chain.name,
        protocol: "morpho" as const,
        positions,
      };
    }),
  );

  const positions: PositionRecord[] = [];
  const errors: { chain: string; protocol: "morpho"; message: string }[] = [];

  results.forEach((result, index) => {
    const chain = SUPPORTED_CHAINS[index];

    if (result.status === "fulfilled") {
      positions.push(...result.value.positions);
      return;
    }

    errors.push({
      chain: chain.name,
      protocol: "morpho",
      message: result.reason instanceof Error ? result.reason.message : "Unknown Morpho adapter error.",
    });
  });

  return { positions, errors };
}
