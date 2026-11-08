import { STAFF_ROLES } from "@/lib/access";
import { canManageEvent, getEventForEdit } from "@/server/services/events";
import { getCurrentUser, type CurrentUser } from "@/server/session";

// Helpers for the REST routes under /api/v1. Errors use the one shape from spec
// section 7. Pages redirect to the login page; an API answers with a status code.

type Extra = Record<string, unknown>;

export function apiError(status: number, code: string, message: string, extra?: Extra) {
  return Response.json({ error: { code, message }, ...extra }, { status });
}

type EventAccess =
  | { ok: true; user: CurrentUser; event: NonNullable<Awaited<ReturnType<typeof getEventForEdit>>> }
  | { ok: false; response: Response };

/** The signed-in admin or coordinator of this event, or the error response to return. */
export async function requireEventStaff(eventId: string): Promise<EventAccess> {
  const fail = (status: number, code: string, message: string) => ({
    ok: false as const,
    response: apiError(status, code, message),
  });

  const user = await getCurrentUser();
  if (!user) return fail(401, "UNAUTHENTICATED", "Log in again to continue.");
  if (!STAFF_ROLES.includes(user.role)) {
    return fail(403, "FORBIDDEN", "You don't have access to this.");
  }

  const event = await getEventForEdit(eventId);
  if (!event) return fail(404, "EVENT_NOT_FOUND", "This event no longer exists.");
  if (!canManageEvent(user, event)) return fail(403, "FORBIDDEN", "You don't manage this event.");

  return { ok: true, user, event };
}
