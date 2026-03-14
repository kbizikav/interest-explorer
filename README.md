# Interest Explorer

A cross-chain lending interest dashboard that tracks accrued interest across DeFi lending protocols.

## Features

- **Cross-chain aggregation** — Scan Ethereum, Arbitrum, Base, Polygon, and Optimism in a single query
- **Accrued interest tracking** — Automatically calculate real-time interest earnings from on-chain principal deltas
- **Multi-protocol support** — Unified view of positions across Aave v3, Morpho, and Compound v3
- **Multi-language UI** — English, Español, Français, 日本語, 한국어, Português, 中文 (via `?lang=` query param)

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Tech Stack

- [Next.js](https://nextjs.org/) (App Router)
- [React](https://react.dev/)
- [TypeScript](https://www.typescriptlang.org/)
- [viem](https://viem.sh/) for on-chain data

## Usage

Enter a wallet address (or try an example) to see:

- Current value and principal across all lending positions
- Accrued interest earned
- Estimated daily interest
- Per-position breakdown by chain and protocol

Switch languages with the language selector or by appending `?lang=ja` (or `es`, `fr`, `ko`, `pt`, `zh`) to the URL.

## License

MIT
