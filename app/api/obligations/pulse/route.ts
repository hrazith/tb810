import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { runMonthlyObligationPulse } from "@/server/obligations/pulse";

export const runtime = "nodejs";

export function isCronRequestAuthorized(authorization: string | null, secret: string | undefined) {
  if (!secret || !authorization?.startsWith("Bearer ")) return false;
  const provided = Buffer.from(authorization.slice("Bearer ".length));
  const expected = Buffer.from(secret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return isCronRequestAuthorized(request.headers.get("authorization"), secret);
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await runMonthlyObligationPulse("system");
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Monthly obligation pulse failed." }, { status: 500 });
  }
}
