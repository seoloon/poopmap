import { NextResponse } from "next/server";
import { getLeaderboard } from "@/lib/leaderboard";
import { withApiErrorHandling } from "@/lib/api-error";

/** Public — no auth required, same as the map itself. */
export const GET = withApiErrorHandling(async () => {
  const entries = await getLeaderboard();
  return NextResponse.json({ entries });
});
