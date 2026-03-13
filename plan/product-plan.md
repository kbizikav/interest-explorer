# Lending Interest Dashboard Plan

## Goal

EVM address を 1 つ入力するだけで、複数チェーン上の lending protocol にあるポジションを横断取得し、protocol ごとの以下を表示するフロントエンドを作る。

- 現在の預入残高
- 現在の金利
- 推定 1 日あたり利子
- 累積利子推定
- USD 換算値

初期対応 protocol は `Aave v3` と `Morpho`。初期対応 chain は `Ethereum`、`Arbitrum`、`Base`、`Polygon`、`Optimism`。

## Product Definition

ユーザーは wallet address を入力し、各チェーンに分散している lending position を一画面で把握できる。

このプロダクトが最初に解決する課題は以下。

- どのチェーンのどの protocol に資産があるか把握しづらい
- 各 protocol ごとの日次利子を比較しづらい
- 元本に対してどれだけ利子が積み上がっているか直感的に見えない

## Scope

### In Scope

- address 入力フォーム
- address に紐づく lending position の集約表示
- chain / protocol / asset ごとの一覧表示
- `推定 1 日利子` の表示
- `累積利子推定` の表示
- USD 換算表示
- 対応 chain / protocol 単位のロード・エラー表示

### Out of Scope

- borrow position の初期対応
- 履歴ベースの厳密な realized PnL
- 入出金イベントを完全追跡した累積利子計算
- 自動売買や再配置
- wallet connect 必須の UX

## Core Metrics

各行で最低限表示する項目:

- `chain`
- `protocol`
- `market / vault`
- `asset symbol`
- `principal USD`
- `current position USD`
- `estimated daily interest USD`
- `estimated daily interest asset`
- `accrued interest USD`
- `accrued interest asset`
- `current APY or supply rate`
- `last updated`

画面上部のサマリー:

- total principal USD
- total current position USD
- total accrued interest USD
- total estimated daily interest USD

## Interest Definitions

### 1. Estimated Daily Interest

定義:

- 現在の position value に現在の supply rate を適用して算出する将来予測値

基本式:

- `daily_interest = current_position_value * annual_rate / 365`

備考:

- protocol により `APR` と `APY` のどちらが取れるかが異なる
- UI では取得値をそのままラベル付きで表示する
- 内部計算は可能なら APR に寄せる。APY のみ取得できる場合は `daily = current_position * apy / 365` の近似でも Phase 1 は許容

### 2. Accrued Interest

定義:

- `現在の interest-bearing token 残高` または `position value` から逆算した現在価値と、元本との差分

基本式:

- `accrued_interest = current_position_value - principal_value`

元本の考え方:

- Aave v3: aToken 残高と liquidity index、または reserve データから current value を取得し、scaled balance から principal を逆算できるか確認
- Morpho: vault / position データから supplied assets と current assets を比較し、元本に相当する基準値を決める

Phase 1 の実務方針:

- protocol ごとに `principal` を直接または準直接に復元できるデータソースを優先利用
- もし protocol / market により principal を安全に復元できない場合、その行は `accrued interest unavailable` として表示し、推定 1 日利子のみ表示

## Architecture Recommendation

Phase 1 は `frontend + thin aggregation API` 構成を推奨する。

理由:

- protocol ごとのデータ取得差分をフロントに持たせないため
- 複数チェーン・複数 API の失敗をサーバー側で吸収しやすいため
- キャッシュや再試行を実装しやすいため
- 将来的な protocol 追加をしやすいため

想定構成:

- Frontend: Next.js
- API layer: Next.js Route Handler または別の小さな Node service
- Data sources: protocol API / subgraph / onchain RPC の組み合わせ

## Data Flow

1. ユーザーが EVM address を入力
2. frontend が `/api/positions?address=...` を呼ぶ
3. API layer が chain x protocol のアダプタを並列実行
4. 各アダプタが position / rate / price を取得
5. API layer が共通スキーマに正規化
6. frontend が summary と table を描画

## Adapter Design

アダプタ単位:

- `chain`
- `protocol`

最小インターフェース:

```ts
type PositionRecord = {
  chain: string;
  protocol: "aave-v3" | "morpho";
  marketId: string;
  marketName: string;
  assetAddress: string;
  assetSymbol: string;
  principalAsset: string | null;
  principalUsd: number | null;
  currentAsset: string;
  currentUsd: number;
  accruedInterestAsset: string | null;
  accruedInterestUsd: number | null;
  rateType: "apr" | "apy";
  annualRate: number | null;
  estimatedDailyInterestAsset: string | null;
  estimatedDailyInterestUsd: number | null;
  sourceTimestamp: string;
  warnings: string[];
};
```

## Protocol Strategy

### Aave v3

取得したいもの:

- address ごとの supplied positions
- reserve metadata
- supply APR / APY
- aToken or scaled balance 系の値
- USD price

優先候補:

- Aave の公式 API / subgraph / view contract

計算方針:

- current position は aToken 残高または現在の reserve 換算量
- principal は scaled balance や index ベースで復元可能かを確認
- daily interest は current position * current rate / 365

### Morpho

取得したいもの:

- address ごとの vault / market position
- current assets
- supply APY / APR
- principal 相当値
- USD price

優先候補:

- Morpho の公式 API / subgraph / SDK

計算方針:

- current position は current supplied assets
- principal は shares / assets の基準値から復元可能か確認
- daily interest は current position * current rate / 365

## Chain Strategy

初期対応 chain:

- Ethereum
- Arbitrum
- Base
- Polygon
- Optimism

実装上の注意:

- chain ごとに利用する endpoint を固定管理する
- chain ごとの失敗は全体失敗にしない
- 結果は `chain + protocol` ごとに部分成功できるようにする

## UI Plan

### Main Screen

- address input
- submit button
- loading state
- summary cards
- positions table
- warning / unsupported rows

### Table UX

列候補:

- Chain
- Protocol
- Asset
- Principal
- Current Value
- Accrued Interest
- Rate
- Est. Daily Interest

補助 UX:

- chain filter
- protocol filter
- USD / asset 単位切り替え
- sort by daily interest / accrued interest

### Empty / Error States

- address が不正
- 対応 protocol にポジションがない
- 一部 chain で取得失敗
- principal が復元できず accrued interest を出せない

## Calculation Notes

Phase 1 の表示はすべて `estimate` と明示する。

特に以下は UI で注記する:

- 金利は現在レートからの推定
- 累積利子は履歴完全追跡ではなく、現在残高と元本推定値の差分
- 小数誤差、価格ソース差分、rebasing / index 更新タイミングにより protocol UI と完全一致しない可能性がある

## Backend/API Response Shape

```ts
type PositionsResponse = {
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
    protocol: string;
    message: string;
  }[];
  generatedAt: string;
};
```

## Technical Risks

- protocol ごとに principal を安全に復元できるか差がある
- rate の定義が protocol / API ごとに異なる
- 価格ソースを揃えないと USD 値にぶれが出る
- address scanning を RPC ベースでやると重い
- subgraph や API の仕様変更に弱い

## Mitigations

- Phase 1 は protocol 数を絞る
- データ取得は adapter 層に閉じ込める
- principal が不明な場合は null を返し、UI で unavailable 表示にする
- price source を 1 つに寄せる
- API レスポンスをキャッシュする

## Suggested Phases

### Phase 1

- Aave v3 / Morpho 対応
- 5 chain 対応
- address lookup
- positions table
- estimated daily interest
- accrued interest estimate

成功条件:

- 対応 protocol に資産がある address で、一覧と合計値が表示される

### Phase 2

- wallet connect
- 詳細 drill-down
- CSV export
- より厳密な principal 復元
- borrow position 対応

### Phase 3

- 入出金イベント追跡
- 実績ベースの利子推定
- 通知やランキング

## Open Questions

- Aave v3 と Morpho で principal 復元に最も安定するデータソースは何か
- price source を protocol 付属に寄せるか、共通価格 API に寄せるか
- ENS 解決や address 履歴保存を入れるか
- TVL が小さいポジションや dust をどう扱うか

## Recommended Next Step

次にやるべき作業:

1. Aave v3 と Morpho のデータ取得手段を比較する
2. `principal`, `current`, `rate` を取得できるかプロトタイプで検証する
3. API response schema を固定する
4. その後に frontend 実装へ進む
