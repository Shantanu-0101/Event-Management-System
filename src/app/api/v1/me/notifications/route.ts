import { z } from "zod";
import { apiError } from "@/server/api";
import { listNotifications, markNotificationsRead } from "@/server/services/notifications";
import { getCurrentUser } from "@/server/session";

const NO_STORE = { "Cache-Control": "no-store" };

/** The signed-in person's latest notifications and unread count, for the bell. */
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return apiError(401, "UNAUTHENTICATED", "Log in again to continue.");
  return Response.json(await listNotifications(me.id), { headers: NO_STORE });
}

const markReadSchema = z.union([
  z.object({ id: z.string().min(1) }),
  z.object({ all: z.literal(true) }),
]);

/** Marks one notification as read, with { id }, or all of them, with { all: true }. */
export async function POST(request: Request) {
  const me = await getCurrentUser();
  if (!me) return apiError(401, "UNAUTHENTICATED", "Log in again to continue.");

  const parsed = markReadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, "BAD_REQUEST", "Say which notification to mark.");

  const id = "id" in parsed.data ? parsed.data.id : null;
  const unread = await markNotificationsRead(me.id, id, new Date());
  return Response.json({ unread }, { headers: NO_STORE });
}
