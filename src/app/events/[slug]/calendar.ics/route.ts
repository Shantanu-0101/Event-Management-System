import { appUrl } from "@/lib/email";
import { buildIcs } from "@/lib/ics";
import { richTextToPlain } from "@/lib/rich-text";
import { getEventBySlug } from "@/server/services/events";

/** "Add to calendar": the event as a downloadable .ics file. */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/events/[slug]/calendar.ics">,
) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event || event.status === "DRAFT") {
    return new Response("Event not found.", { status: 404 });
  }

  const url = appUrl(`/events/${event.slug}`);
  const body = buildIcs({
    uid: `${event.id}@campus-events`,
    title: event.title,
    description: `${richTextToPlain(event.description)}\n\n${url}`,
    location: event.venue
      ? [event.venue.name, event.venue.building].filter(Boolean).join(", ")
      : null,
    url,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    cancelled: event.status === "CANCELLED",
    now: new Date(),
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${event.slug}.ics"`,
    },
  });
}
