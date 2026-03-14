import {
  AaveV3Arbitrum,
  AaveV3Base,
  AaveV3Ethereum,
  AaveV3Optimism,
  AaveV3Polygon,
} from "@bgd-labs/aave-address-book";
import { createPublicClient, formatUnits, getAddress, http, isAddress, type PublicClient } from "viem";

import { SUPPORTED_CHAINS, type SupportedChain } from "@/lib/chains";
import { withTimeout } from "@/lib/async";
import { getOptionalAlchemyKey } from "@/lib/env";
import { roundNumber } from "@/lib/format";
import type { PositionRecord } from "@/lib/types";

const RAY = 10n ** 27n;
const CHAIN_TIMEOUT_MS = 8_000;

const POOL_ABI = [
  {
    type: "function",
    name: "getReservesList",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address[]" }],
  },
  {
    type: "function",
    name: "getReserveData",
    stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "configuration", type: "uint256" },
          { name: "liquidityIndex", type: "uint128" },
          { name: "currentLiquidityRate", type: "uint128" },
          { name: "variableBorrowIndex", type: "uint128" },
          { name: "currentVariableBorrowRate", type: "uint128" },
          { name: "currentStableBorrowRate", type: "uint128" },
          { name: "lastUpdateTimestamp", type: "uint40" },
          { name: "id", type: "uint16" },
          { name: "aTokenAddress", type: "address" },
          { name: "stableDebtTokenAddress", type: "address" },
          { name: "variableDebtTokenAddress", type: "address" },
          { name: "interestRateStrategyAddress", type: "address" },
          { name: "accruedToTreasury", type: "uint128" },
          { name: "unbacked", type: "uint128" },
          { name: "isolationModeTotalDebt", type: "uint128" },
        ],
      },
    ],
  },
] as const;

const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
] as const;

const ORACLE_ABI = [
  {
    type: "function",
    name: "BASE_CURRENCY_UNIT",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "getAssetPrice",
    stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

const POOL_EVENTS_ABI = [
  {
    type: "event",
    name: "Supply",
    anonymous: false,
    inputs: [
      { name: "reserve", type: "address", indexed: true },
      { name: "user", type: "address", indexed: false },
      { name: "onBehalfOf", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "referralCode", type: "uint16", indexed: true },
    ],
  },
  {
    type: "event",
    name: "Withdraw",
    anonymous: false,
    inputs: [
      { name: "reserve", type: "address", indexed: true },
      { name: "user", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;

type AaveMarket =
  | typeof AaveV3Ethereum
  | typeof AaveV3Arbitrum
  | typeof AaveV3Base
  | typeof AaveV3Polygon
  | typeof AaveV3Optimism;

type ReserveData = {
  liquidityIndex: bigint;
  currentLiquidityRate: bigint;
  lastUpdateTimestamp: number;
  aTokenAddress: `0x${string}`;
};

type ReserveDataResult = {
  liquidityIndex: bigint;
  currentLiquidityRate: bigint;
  lastUpdateTimestamp: bigint;
  aTokenAddress: `0x${string}`;
};

type ActiveReserve = {
  asset: `0x${string}`;
  reserve: ReserveData;
  balance: bigint;
};

type PrincipalBreakdown = {
  principalByAsset: Map<string, bigint | null>;
  warningsByAsset: Map<string, string[]>;
};

function getAaveClient(chain: SupportedChain) {
  const alchemyKey = getOptionalAlchemyKey();

  return createPublicClient({
    chain: chain.viemChain,
    transport: http(chain.rpcUrl(alchemyKey), { timeout: CHAIN_TIMEOUT_MS }),
  });
}

function toUsd(amount: bigint, decimals: number, price: bigint, baseCurrencyUnit: bigint) {
  const amountFloat = Number(formatUnits(amount, decimals));
  const priceFloat = Number(price) / Number(baseCurrencyUnit);

  return amountFloat * priceFloat;
}

async function fetchPrincipalBreakdown(
  client: PublicClient,
  chain: SupportedChain,
  market: AaveMarket,
  activeReserves: ActiveReserve[],
  address: `0x${string}`,
): Promise<PrincipalBreakdown> {
  const principalEntries = await Promise.all(
    activeReserves.map(async (item) => {
      const [supplyLogs, withdrawLogs] = await Promise.all([
        client.getLogs({
          address: market.POOL,
          event: POOL_EVENTS_ABI[0],
          args: {
            reserve: item.asset,
            onBehalfOf: address,
          },
          fromBlock: 0n,
          toBlock: "latest",
        }),
        client.getLogs({
          address: market.POOL,
          event: POOL_EVENTS_ABI[1],
          args: {
            reserve: item.asset,
            user: address,
          },
          fromBlock: 0n,
          toBlock: "latest",
        }),
      ]);

      const supplied = supplyLogs.reduce((total, log) => total + (log.args.amount ?? 0n), 0n);
      const withdrawn = withdrawLogs.reduce((total, log) => total + (log.args.amount ?? 0n), 0n);
      const principal = supplied - withdrawn;
      const warnings: string[] = [];

      if (principal < 0n) {
        warnings.push(
          `Aave principal reconstruction became negative on ${chain.name}; this position may include delegated activity or transfers.`,
        );
        return [getAddress(item.asset), { principal: null, warnings }] as const;
      }

      if (principal > item.balance) {
        warnings.push(
          "Aave principal reconstructed from pool events exceeds the current balance; aToken transfers are not yet included.",
        );
        return [getAddress(item.asset), { principal: null, warnings }] as const;
      }

      return [getAddress(item.asset), { principal, warnings }] as const;
    }),
  );

  const principalByAsset = new Map<string, bigint | null>();
  const warningsByAsset = new Map<string, string[]>();

  for (const [asset, result] of principalEntries) {
    principalByAsset.set(asset, result.principal);
    warningsByAsset.set(asset, result.warnings);
  }

  return { principalByAsset, warningsByAsset };
}

async function fetchChainPositions(chain: SupportedChain, address: `0x${string}`): Promise<PositionRecord[]> {
  const client = getAaveClient(chain);
  const market: AaveMarket = chain.aaveMarket;

  const reserveAssets = await client.readContract({
    address: market.POOL,
    abi: POOL_ABI,
    functionName: "getReservesList",
  });

  const [reserveResults, baseCurrencyUnitResult] = await Promise.all([
    client.multicall({
      contracts: reserveAssets.map((asset) => ({
        address: market.POOL,
        abi: POOL_ABI,
        functionName: "getReserveData",
        args: [asset],
      })),
    }),
    client.readContract({
      address: market.ORACLE,
      abi: ORACLE_ABI,
      functionName: "BASE_CURRENCY_UNIT",
    }),
  ]);

  const reserveMap = new Map<string, ReserveData>();

  reserveResults.forEach((result, index) => {
    if (result.status !== "success") {
      return;
    }

    const reserve = result.result as unknown as ReserveDataResult;

    reserveMap.set(getAddress(reserveAssets[index]), {
      liquidityIndex: reserve.liquidityIndex,
      currentLiquidityRate: reserve.currentLiquidityRate,
      lastUpdateTimestamp: Number(reserve.lastUpdateTimestamp),
      aTokenAddress: reserve.aTokenAddress,
    });
  });

  const balanceResults = await client.multicall({
    contracts: reserveAssets
      .map((asset) => reserveMap.get(getAddress(asset)))
      .filter((reserve): reserve is ReserveData => reserve !== undefined)
      .map((reserve) => ({
        address: reserve.aTokenAddress,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [address],
      })),
  });

  const activeReserves: ActiveReserve[] = reserveAssets.flatMap((asset, index) => {
    const reserve = reserveMap.get(getAddress(asset));
    const balance = balanceResults[index];
    const balanceValue = balance?.status === "success" ? (balance.result as unknown as bigint) : null;

    if (!reserve || balanceValue === null || balanceValue <= 0n) {
      return [];
    }

    return [
      {
        asset,
        reserve,
        balance: balanceValue,
      },
    ];
  });

  if (activeReserves.length === 0) {
    return [];
  }

  const canReconstructPrincipal = Boolean(getOptionalAlchemyKey());
  const defaultBreakdown: PrincipalBreakdown = {
    principalByAsset: new Map(activeReserves.map((item) => [getAddress(item.asset), null])),
    warningsByAsset: new Map(
      activeReserves.map((item) => [
        getAddress(item.asset),
        canReconstructPrincipal
          ? []
          : [
              "Aave accrued interest needs historical event logs from an RPC with broad eth_getLogs support. Set ALCHEMY_KEY to enable it.",
            ],
      ]),
    ),
  };

  const [{ principalByAsset, warningsByAsset }, symbolResults, decimalsResults, priceResults] =
    await Promise.all([
      canReconstructPrincipal
        ? fetchPrincipalBreakdown(client, chain, market, activeReserves, address)
        : Promise.resolve(defaultBreakdown),
      client.multicall({
        contracts: activeReserves.map((item) => ({
          address: item.asset,
          abi: ERC20_ABI,
          functionName: "symbol",
        })),
      }),
      client.multicall({
        contracts: activeReserves.map((item) => ({
          address: item.asset,
          abi: ERC20_ABI,
          functionName: "decimals",
        })),
      }),
      client.multicall({
        contracts: activeReserves.map((item) => ({
          address: market.ORACLE,
          abi: ORACLE_ABI,
          functionName: "getAssetPrice",
          args: [item.asset],
        })),
      }),
    ]);

  return activeReserves.map((item, index) => {
    const symbol = symbolResults[index];
    const decimals = decimalsResults[index];
    const price = priceResults[index];

    if (
      symbol?.status !== "success" ||
      decimals?.status !== "success" ||
      price?.status !== "success"
    ) {
      throw new Error(`Failed to load Aave metadata for ${item.asset} on ${chain.name}.`);
    }

    const symbolValue = symbol.result as unknown as string;
    const decimalsValue = Number(decimals.result as unknown as number | bigint);
    const priceValue = price.result as unknown as bigint;
    const assetKey = getAddress(item.asset);
    const principalRaw = principalByAsset.get(assetKey) ?? null;
    const currentAsset = Number(formatUnits(item.balance, decimalsValue));
    const currentUsd = toUsd(item.balance, decimalsValue, priceValue, baseCurrencyUnitResult);
    const principalAsset =
      principalRaw === null ? null : Number(formatUnits(principalRaw, decimalsValue));
    const principalUsd =
      principalRaw === null ? null : toUsd(principalRaw, decimalsValue, priceValue, baseCurrencyUnitResult);
    const accruedInterestAsset =
      principalAsset === null ? null : currentAsset - principalAsset;
    const accruedInterestUsd = principalUsd === null ? null : currentUsd - principalUsd;
    const annualRate = Number(item.reserve.currentLiquidityRate) / Number(RAY);

    return {
      chain: chain.name,
      protocol: "aave-v3" as const,
      marketId: `${chain.slug}:${item.reserve.aTokenAddress}`,
      marketName: `Aave ${symbolValue}`,
      assetAddress: item.asset,
      assetSymbol: symbolValue,
      principalAsset: roundNumber(principalAsset, 6),
      principalUsd: roundNumber(principalUsd, 2),
      currentAsset: roundNumber(currentAsset, 6) ?? 0,
      currentUsd: roundNumber(currentUsd, 2) ?? 0,
      accruedInterestAsset: roundNumber(accruedInterestAsset, 6),
      accruedInterestUsd: roundNumber(accruedInterestUsd, 2),
      rateType: "apr" as const,
      annualRate: roundNumber(annualRate, 6),
      estimatedDailyInterestAsset: roundNumber(currentAsset * annualRate / 365, 8),
      estimatedDailyInterestUsd: roundNumber(currentUsd * annualRate / 365, 4),
      sourceTimestamp: new Date(item.reserve.lastUpdateTimestamp * 1000).toISOString(),
      warnings: warningsByAsset.get(assetKey) ?? [],
    };
  });
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
          positions: await withTimeout(
            fetchChainPositions(chain, checksumAddress),
            CHAIN_TIMEOUT_MS,
            `Aave adapter timed out on ${chain.name}.`,
          ),
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
