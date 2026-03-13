import type { PositionRecord, PositionsResponse } from "@/lib/types";

function sumNullable(values: Array<number | null>) {
  let sawValue = false;
  let total = 0;

  for (const value of values) {
    if (value === null) {
      continue;
    }

    sawValue = true;
    total += value;
  }

  return sawValue ? total : null;
}

export function buildResponse(
  address: string,
  positions: PositionRecord[],
  errors: PositionsResponse["errors"],
): PositionsResponse {
  const sortedPositions = [...positions].sort((a, b) => b.currentUsd - a.currentUsd);

  return {
    address,
    totals: {
      principalUsd: sumNullable(sortedPositions.map((position) => position.principalUsd)),
      currentUsd: sortedPositions.reduce((total, position) => total + position.currentUsd, 0),
      accruedInterestUsd: sumNullable(sortedPositions.map((position) => position.accruedInterestUsd)),
      estimatedDailyInterestUsd: sumNullable(
        sortedPositions.map((position) => position.estimatedDailyInterestUsd),
      ),
    },
    positions: sortedPositions,
    errors,
    generatedAt: new Date().toISOString(),
  };
}

