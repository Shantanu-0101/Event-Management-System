import { z } from "zod";
import type { CheckInErrorCode } from "@/lib/check-in";
import { apiError, requireEventStaff } from "@/server/api";
import { checkIn, CheckInError, getCheckInCounts } from "@/server/services/check-in";

type Context = RouteContext<"/api/v1/events/[id]/checkin">;

const bodySchema = z.union([
  z.object({ ticketCode: z.string().trim().min(1).max(64) }),
  z.object({ registrationId: z.string().trim().min(1).max(64) }),
]);

const STATUS: Record<CheckInErrorCode, number> = {
  INVALID_TICKET: 404,
  NOT_ALLOWED: 403,
  WRONG_EVENT: 409,
  NOT_CONFIRMED: 409,
  ALREADY_CHECKED_IN: 409,
  NOT_CHECKED_IN: 409,
  CHECK_IN_CLOSED: 409,
};

/** The live counter: registered vs checked in. */
export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  const access = await requireEventStaff(id);
  if (!access.ok) return access.response;
  return Response.json(await getCheckInCounts(id), { headers: { "Cache-Control": "no-store" } });
}

/** Marks attendance. Body: a scanned or typed ticket code, or a registration from search. */
export async function POST(request: Request, { params }: Context) {
  const { id } = await params;
  const access = await requireEventStaff(id);
  if (!access.ok) return access.response;

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return apiError(400, "BAD_REQUEST", "Send a ticket code or a registration id.");
  }

  try {
    return Response.json(await checkIn(access.user, id, body.data, new Date()));
  } catch (e) {
    if (!(e instanceof CheckInError)) throw e;
    return apiError(STATUS[e.code], e.code, e.message, e.person ? { person: e.person } : undefined);
  }
}
