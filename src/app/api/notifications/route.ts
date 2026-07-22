import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { listNotifications, unreadCount } from "@/lib/notifications";
import { withApiErrorHandling } from "@/lib/api-error";

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

/** The current user's own notifications, paginated — never another user's. */
export const GET = withApiErrorHandling(async (req: NextRequest) => {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Connecte-toi pour voir tes notifications" }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const cursorParam = params.get("cursor");
  const cursor = cursorParam !== null && Number.isInteger(Number(cursorParam)) ? Number(cursorParam) : null;
  const limitParam = Number(params.get("limit"));
  const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, MAX_LIMIT) : DEFAULT_LIMIT;

  const [{ items, nextCursor }, unread] = await Promise.all([listNotifications(me.id, cursor, limit), unreadCount(me.id)]);
  return NextResponse.json({ items, nextCursor, unread });
});
