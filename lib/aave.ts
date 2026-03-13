import { AaveV3Arbitrum, AaveV3Base, AaveV3Ethereum, AaveV3Optimism, AaveV3Polygon } from "@bgd-labs/aave-address-book";
import { IUiPoolDataProvider_ABI } from "@bgd-labs/aave-address-book/abis";
import { formatUnits, getAddress, http, isAddress, createPublicClient } from "viem";

import { SUPPORTED_CHAINS, type SupportedChain } from "@/lib/chains";
import { getAlchemyKey } from "@/lib/env";
import { roundNumber } from "@/lib/format";
import type { PositionRecord } from "@/lib/types";

const RAY = 10n ** 27n;
const PRICE_DECIMALS = 8;

type AaveMarket =
  | typeof AaveV3Ethereum
  | typeof AaveV3Arbitrum
  | typeof AaveV3Base
  | typeof AaveV3Polygon
  | typeof AaveV3Optimism;

function getAaveClient(chain: SupportedChain) {
  const alchemyKey = getAlchemyKey();

  return createPublicClient({
    chain: chain.viemChain,
    transport: http(chain.rpcUrl(alchemyKey)),
  });
}

function rayMul(value: bigint, ray: bigint) {
  return (value * ray) / RAY;
}

function toUsd(
  amount: bigint,
  decimals: number,
  priceInMarketReferenceCurrency: bigint,
  marketReferenceCurrencyUnit: bigint,
  marketReferenceCurrencyPriceInUsd: bigint,
) {
  const amountFloat = Number(formatUnits(amount, decimals));
  const assetPriceRef = Number(priceInMarketReferenceCurrency) / Number(marketReferenceCurrencyUnit);
  const referenceUsd = Number(marketReferenceCurrencyPriceInUsd) / 10 ** PRICE_DECIMALS;

  return amountFloat * assetPriceRef * referenceUsd;
}

async function fetchChainPositions(chain: SupportedChain, address: `0x${string}`): Promise<PositionRecord[]> {
  const client = getAaveClient(chain);
  const market: AaveMarket = chain.aaveMarket;

  const [reservesResult, userReservesResult] = await Promise.all([
    client.readContract({
      address: market.UI_POOL_DATA_PROVIDER,
      abi: IUiPoolDataProvider_ABI,
      functionName: "getReservesData",
      args: [market.POOL_ADDRESSES_PROVIDER],
    }),
    client.readContract({
      address: market.UI_POOL_DATA_PROVIDER,
      abi: IUiPoolDataProvider_ABI,
      functionName: "getUserReservesData",
      args: [market.POOL_ADDRESSES_PROVIDER, address],
    }),
  ]);

  const [reserves, baseCurrencyInfo] = reservesResult;
  const [userReserves] = userReservesResult;

  const reserveMap = new Map(
    reserves.map((reserve) => [getAddress(reserve.underlyingAsset), reserve]),
  );

  const positions: PositionRecord[] = [];

  for (const userReserve of userReserves) {
    if (userReserve.scaledATokenBalance <= 0n) {
      continue;
    }

      const reserve = reserveMap.get(getAddress(userReserve.underlyingAsset));

      if (!reserve) {
        continue;
      }

      const currentBalance = rayMul(userReserve.scaledATokenBalance, reserve.liquidityIndex);
      const currentAsset = Number(formatUnits(currentBalance, Number(reserve.decimals)));
      const currentUsd = toUsd(
        currentBalance,
        Number(reserve.decimals),
        reserve.priceInMarketReferenceCurrency,
        baseCurrencyInfo.marketReferenceCurrencyUnit,
        baseCurrencyInfo.marketReferenceCurrencyPriceInUsd,
      );
      const annualRate = Number(reserve.liquidityRate) / Number(RAY);
      const estimatedDailyInterestAsset = currentAsset * annualRate / 365;
      const estimatedDailyInterestUsd = currentUsd * annualRate / 365;

      positions.push({
        chain: chain.name,
        protocol: "aave-v3" as const,
        marketId: `${chain.slug}:${reserve.aTokenAddress}`,
        marketName: reserve.name,
        assetAddress: reserve.underlyingAsset,
        assetSymbol: reserve.symbol,
        principalAsset: null,
        principalUsd: null,
        currentAsset: roundNumber(currentAsset, 6) ?? 0,
        currentUsd: roundNumber(currentUsd, 2) ?? 0,
        accruedInterestAsset: null,
        accruedInterestUsd: null,
        rateType: "apr" as const,
        annualRate: roundNumber(annualRate, 6),
        estimatedDailyInterestAsset: roundNumber(estimatedDailyInterestAsset, 8),
        estimatedDailyInterestUsd: roundNumber(estimatedDailyInterestUsd, 4),
        sourceTimestamp: new Date(Number(reserve.lastUpdateTimestamp) * 1000).toISOString(),
        warnings: [
          "Aave principal is not reconstructed in Phase 1, so accrued interest is unavailable.",
        ],
      });
    }

  return positions;
}

export async function fetchAavePositions(address: string) {
  if (!isAddress(address)) {
    throw new Error("Invalid EVM address.");
  }

  const checksumAddress = getAddress(address);
  const results = await Promise.allSettled(
    SUPPORTED_CHAINS.map(async (chain) => {
      try {
        return {
          chain: chain.name,
          protocol: "aave-v3" as const,
          positions: await fetchChainPositions(chain, checksumAddress),
        };
      } catch (error) {
        throw Object.assign(
          error instanceof Error ? error : new Error("Unknown Aave adapter error."),
          { chain: chain.name },
        );
      }
    }),
  );

  const positions: PositionRecord[] = [];
  const errors: { chain: string; protocol: "aave-v3"; message: string }[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      positions.push(...result.value.positions);
      continue;
    }

    const rejected = result.reason as Error & { chain?: string };
    errors.push({
      chain: rejected.chain ?? "unknown",
      protocol: "aave-v3",
      message: rejected.message,
    });
  }

  return { positions, errors };
}
