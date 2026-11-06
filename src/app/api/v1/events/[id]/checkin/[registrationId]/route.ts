import { apiError, requireEventStaff } from "@/server/api";
import { CheckInError, undoCheckIn } from "@/server/services/check-in";

/** Takes back a check-in made by mistake. */
export async function DELETE(
  _request: Request,
  { params }: RouteContext<"/api/v1/events/[id]/checkin/[registrationId]">,
) {
  const { id, registrationId } = await params;
  const access = await requireEventStaff(id);
  if (!access.ok) return access.response;

  try {
    return Response.json(await undoCheckIn(access.user, id, registrationId, new Date()));
  } catch (e) {
    if (e instanceof CheckInError) return apiError(409, e.code, e.message);
    throw e;
  }
}
