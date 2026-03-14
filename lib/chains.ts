import {
  arbitrum,
  base,
  mainnet,
  optimism,
  polygon,
  type Chain,
} from "viem/chains";

import {
  AaveV3Arbitrum,
  AaveV3Base,
  AaveV3Ethereum,
  AaveV3Optimism,
  AaveV3Polygon,
} from "@bgd-labs/aave-address-book";

export type SupportedChain = {
  id: number;
  slug: "ethereum" | "arbitrum" | "base" | "polygon" | "optimism";
  name: string;
  viemChain: Chain;
  rpcUrl: (alchemyKey?: string) => string;
  aaveMarket:
    | typeof AaveV3Ethereum
    | typeof AaveV3Arbitrum
    | typeof AaveV3Base
    | typeof AaveV3Polygon
    | typeof AaveV3Optimism;
};

export const SUPPORTED_CHAINS: SupportedChain[] = [
  {
    id: 1,
    slug: "ethereum",
    name: "Ethereum",
    viemChain: mainnet,
    rpcUrl: (alchemyKey) =>
      alchemyKey ? `https://eth-mainnet.g.alchemy.com/v2/${alchemyKey}` : mainnet.rpcUrls.default.http[0],
    aaveMarket: AaveV3Ethereum,
  },
  {
    id: 42161,
    slug: "arbitrum",
    name: "Arbitrum",
    viemChain: arbitrum,
    rpcUrl: (alchemyKey) =>
      alchemyKey ? `https://arb-mainnet.g.alchemy.com/v2/${alchemyKey}` : arbitrum.rpcUrls.default.http[0],
    aaveMarket: AaveV3Arbitrum,
  },
  {
    id: 8453,
    slug: "base",
    name: "Base",
    viemChain: base,
    rpcUrl: (alchemyKey) =>
      alchemyKey ? `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}` : base.rpcUrls.default.http[0],
    aaveMarket: AaveV3Base,
  },
  {
    id: 137,
    slug: "polygon",
    name: "Polygon",
    viemChain: polygon,
    rpcUrl: (alchemyKey) =>
      alchemyKey ? `https://polygon-mainnet.g.alchemy.com/v2/${alchemyKey}` : polygon.rpcUrls.default.http[0],
    aaveMarket: AaveV3Polygon,
  },
  {
    id: 10,
    slug: "optimism",
    name: "Optimism",
    viemChain: optimism,
    rpcUrl: (alchemyKey) =>
      alchemyKey ? `https://opt-mainnet.g.alchemy.com/v2/${alchemyKey}` : optimism.rpcUrls.default.http[0],
    aaveMarket: AaveV3Optimism,
  },
];

export function getSupportedChain(chainId: number) {
  return SUPPORTED_CHAINS.find((chain) => chain.id === chainId);
}
