import { createPublicClient, formatUnits, getAddress, http, isAddress } from "viem";

import { SUPPORTED_CHAINS, type SupportedChain } from "@/lib/chains";
import { withTimeout } from "@/lib/async";
import { getOptionalAlchemyKey } from "@/lib/env";
import { roundNumber } from "@/lib/format";
import type { PositionRecord } from "@/lib/types";

const FACTOR_SCALE = 10n ** 18n;
const PRICE_SCALE = 10n ** 8n;
const SECONDS_PER_YEAR = 31_536_000;
const CHAIN_TIMEOUT_MS = 8_000;

const COMET_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "userBasic",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [
      { name: "principal", type: "int104" },
      { name: "baseTrackingIndex", type: "uint64" },
      { name: "baseTrackingAccrued", type: "uint64" },
      { name: "assetsIn", type: "uint16" },
      { name: "_reserved", type: "uint8" },
    ],
  },
  {
    type: "function",
    name: "totalsBasic",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "baseSupplyIndex", type: "uint64" },
          { name: "baseBorrowIndex", type: "uint64" },
          { name: "trackingSupplyIndex", type: "uint64" },
          { name: "trackingBorrowIndex", type: "uint64" },
          { name: "totalSupplyBase", type: "uint104" },
          { name: "totalBorrowBase", type: "uint104" },
          { name: "lastAccrualTime", type: "uint40" },
          { name: "pauseFlags", type: "uint8" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getUtilization",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "getSupplyRate",
    stateMutability: "view",
    inputs: [{ name: "utilization", type: "uint256" }],
    outputs: [{ type: "uint64" }],
  },
  {
    type: "function",
    name: "getPrice",
    stateMutability: "view",
    inputs: [{ name: "priceFeed", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

type CompoundMarket = {
  chainId: number;
  comet: `0x${string}`;
  baseTokenAddress: `0x${string}`;
  baseTokenPriceFeed: `0x${string}`;
  assetSymbol: string;
  marketName: string;
  decimals: number;
};

type UserBasicResult = readonly [bigint, bigint, bigint, number, number];

type TotalsBasicResult = {
  lastAccrualTime: bigint | number;
};

const COMPOUND_MARKETS: CompoundMarket[] = [
  {
    chainId: 1,
    comet: "0xc3d688B66703497DAA19211EEdff47f25384cdc3",
    baseTokenAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    baseTokenPriceFeed: "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6",
    assetSymbol: "USDC",
    marketName: "Compound USDC",
    decimals: 6,
  },
  {
    chainId: 42161,
    comet: "0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf",
    baseTokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    baseTokenPriceFeed: "0x50834F3163758fcC1Df9973b6e91f0F0F0434aD3",
    assetSymbol: "USDC",
    marketName: "Compound USDC",
    decimals: 6,
  },
  {
    chainId: 8453,
    comet: "0xb125E6687d4313864e53df431d5425969c15Eb2F",
    baseTokenAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    baseTokenPriceFeed: "0x7e860098F58bBFC8648a4311b374B1D669a2bc6B",
    assetSymbol: "USDC",
    marketName: "Compound USDC",
    decimals: 6,
  },
  {
    chainId: 137,
    comet: "0xF25212E676D1F7F89Cd72fFEe66158f541246445",
    baseTokenAddress: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
    baseTokenPriceFeed: "0xfE4A8cc5b5B2366C1B58Bea3858e81843581b2F7",
    assetSymbol: "USDC",
    marketName: "Compound USDC",
    decimals: 6,
  },
  {
    chainId: 10,
    comet: "0x2e44e174f7D53F0212823acC11C01A11d58c5bCB",
    baseTokenAddress: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    baseTokenPriceFeed: "0x16a9FA2FDa030272Ce99B29CF780dFA30361E0f3",
    assetSymbol: "USDC",
    marketName: "Compound USDC",
    decimals: 6,
  },
];

function getCompoundClient(chain: SupportedChain) {
  return createPublicClient({
    chain: chain.viemChain,
    transport: http(chain.rpcUrl(getOptionalAlchemyKey()), { timeout: CHAIN_TIMEOUT_MS }),
  });
}

function getCompoundMarket(chainId: number) {
  return COMPOUND_MARKETS.find((market) => market.chainId === chainId);
}

function toUsd(amount: bigint, decimals: number, price: bigint) {
  const amountFloat = Number(formatUnits(amount, decimals));
  const priceFloat = Number(price) / Number(PRICE_SCALE);

  return amountFloat * priceFloat;
}

async function fetchCompoundChainPositions(
  chain: SupportedChain,
  address: `0x${string}`,
): Promise<PositionRecord[]> {
  const market = getCompoundMarket(chain.id);

  if (!market) {
    return [];
  }

  const client = getCompoundClient(chain);
  const [balanceResult, userBasicResult, utilizationResult, totalsBasicResult, priceResult] =
    await Promise.all([
      client.readContract({
        address: market.comet,
        abi: COMET_ABI,
        functionName: "balanceOf",
        args: [address],
      }),
      client.readContract({
        address: market.comet,
        abi: COMET_ABI,
        functionName: "userBasic",
        args: [address],
      }),
      client.readContract({
        address: market.comet,
        abi: COMET_ABI,
        functionName: "getUtilization",
      }),
      client.readContract({
        address: market.comet,
        abi: COMET_ABI,
        functionName: "totalsBasic",
      }),
      client.readContract({
        address: market.comet,
        abi: COMET_ABI,
        functionName: "getPrice",
        args: [market.baseTokenPriceFeed],
      }),
    ]);

  const principalRaw = (userBasicResult as unknown as UserBasicResult)[0];
  const currentRaw = balanceResult as unknown as bigint;

  if (principalRaw <= 0n || currentRaw <= 0n) {
    return [];
  }

  const supplyRate = (await client.readContract({
    address: market.comet,
    abi: COMET_ABI,
    functionName: "getSupplyRate",
    args: [utilizationResult as unknown as bigint],
  })) as unknown as bigint;

  const principalAsset = Number(formatUnits(principalRaw, market.decimals));
  const currentAsset = Number(formatUnits(currentRaw, market.decimals));
  const price = priceResult as unknown as bigint;
  const principalUsd = toUsd(principalRaw, market.decimals, price);
  const currentUsd = toUsd(currentRaw, market.decimals, price);
  const accruedInterestAsset = currentAsset - principalAsset;
  const accruedInterestUsd = currentUsd - principalUsd;
  const annualRate = Number((supplyRate * BigInt(SECONDS_PER_YEAR) * 1_000_000n) / FACTOR_SCALE) / 1_000_000;
  const sourceTimestamp = new Date(
    Number((totalsBasicResult as unknown as TotalsBasicResult).lastAccrualTime) * 1000,
  ).toISOString();

  return [
    {
      chain: chain.name,
      protocol: "compound-v3",
      marketId: `${chain.slug}:${market.comet}`,
      marketName: market.marketName,
      assetAddress: getAddress(market.baseTokenAddress),
      assetSymbol: market.assetSymbol,
      principalAsset: roundNumber(principalAsset, 6),
      principalUsd: roundNumber(principalUsd, 2),
      currentAsset: roundNumber(currentAsset, 6) ?? 0,
      currentUsd: roundNumber(currentUsd, 2) ?? 0,
      accruedInterestAsset: roundNumber(accruedInterestAsset, 6),
      accruedInterestUsd: roundNumber(accruedInterestUsd, 2),
      rateType: "apr",
      annualRate: roundNumber(annualRate, 6),
      estimatedDailyInterestAsset: roundNumber(currentAsset * annualRate / 365, 8),
      estimatedDailyInterestUsd: roundNumber(currentUsd * annualRate / 365, 4),
      sourceTimestamp,
      warnings: [],
    },
  ];
}

export async function fetchCompoundPositions(address: string) {
  if (!isAddress(address)) {
    throw new Error("Invalid EVM address.");
  }

  const checksumAddress = getAddress(address);
  const results = await Promise.allSettled(
    SUPPORTED_CHAINS.map(async (chain) => {
      try {
        return {
          chain: chain.name,
          protocol: "compound-v3" as const,
          positions: await withTimeout(
            fetchCompoundChainPositions(chain, checksumAddress),
            CHAIN_TIMEOUT_MS,
            `Compound adapter timed out on ${chain.name}.`,
          ),
        };
      } catch (error) {
        throw Object.assign(
          error instanceof Error ? error : new Error("Unknown Compound adapter error."),
          { chain: chain.name },
        );
      }
    }),
  );

  const positions: PositionRecord[] = [];
  const errors: { chain: string; protocol: "compound-v3"; message: string }[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      positions.push(...result.value.positions);
      continue;
    }

    const rejected = result.reason as Error & { chain?: string };
    errors.push({
      chain: rejected.chain ?? "unknown",
      protocol: "compound-v3",
      message: rejected.message,
    });
  }

  return { positions, errors };
}
