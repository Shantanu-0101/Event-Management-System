import { requireEventStaff } from "@/server/api";
import { searchForCheckIn } from "@/server/services/check-in";

/** The manual fallback on the check-in page: find a confirmed person by name, roll no or team. */
export async function GET(
  request: Request,
  { params }: RouteContext<"/api/v1/events/[id]/checkin/search">,
) {
  const { id } = await params;
  const access = await requireEventStaff(id);
  if (!access.ok) return access.response;

  const q = new URL(request.url).searchParams.get("q")?.trim().slice(0, 100) ?? "";
  const people = q ? await searchForCheckIn(id, q) : [];
  return Response.json({ people }, { headers: { "Cache-Control": "no-store" } });
}
