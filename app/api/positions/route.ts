import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";

import { buildResponse } from "@/lib/aggregate";
import { fetchAavePositions } from "@/lib/aave";
import { fetchMorphoPositions } from "@/lib/morpho";

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");

  if (!address || !isAddress(address)) {
    return NextResponse.json(
      { error: "Please provide a valid EVM address." },
      { status: 400 },
    );
  }

  try {
    const [aave, morpho] = await Promise.all([
      fetchAavePositions(address),
      fetchMorphoPositions(address),
    ]);

    return NextResponse.json(
      buildResponse(address, [...aave.positions, ...morpho.positions], [
        ...aave.errors,
        ...morpho.errors,
      ]),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown server error.",
      },
      { status: 500 },
    );
  }
}

