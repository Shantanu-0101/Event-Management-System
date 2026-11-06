import type { Event } from "@/generated/prisma/client";
import type { EventInput } from "@/lib/event-schema";

/** What the event form would post for this event, with some fields changed. */
export function eventInputDefaults(event: Event, changes: Partial<EventInput> = {}): EventInput {
  return {
    title: event.title,
    categoryId: event.categoryId,
    subEvent: event.subEvent,
    description: event.description,
    posterUrl: event.posterUrl,
    rulesUrl: event.rulesUrl,
    venueId: event.venueId,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    regOpensAt: event.regOpensAt,
    regClosesAt: event.regClosesAt,
    capacity: event.capacity,
    participation: event.participation,
    teamMin: event.teamMin,
    teamMax: event.teamMax,
    seatPer: event.seatPer,
    departmentIds: [],
    years: [],
    coordinatorIds: [],
    ...changes,
  };
}
