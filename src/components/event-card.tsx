import Image from "next/image";
import Link from "next/link";
import { CalendarIcon, MapPinIcon } from "lucide-react";
import { effectiveStatus, seatsLeft, seatsTaken } from "@/lib/events";
import { formatDateTime } from "@/lib/time";
import type { eventCardSelect } from "@/server/services/events";
import type { Prisma } from "@/generated/prisma/client";
import { CategoryIcon } from "@/components/category-icon";
import { EventStatusBadge } from "@/components/event-status-badge";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

type EventCardData = Prisma.EventGetPayload<{ select: typeof eventCardSelect }>;

export function EventCard({
  event,
  now,
  priority,
}: {
  event: EventCardData;
  now: Date;
  priority?: boolean;
}) {
  const status = effectiveStatus(event, now);
  const left = seatsLeft(event.capacity, seatsTaken(event));

  return (
    <Card className="h-full gap-0 overflow-hidden py-0 transition-shadow focus-within:ring-2 focus-within:ring-ring hover:shadow-md">
      <div className="relative flex aspect-video items-center justify-center bg-muted">
        {event.posterUrl ? (
          <Image
            src={event.posterUrl}
            alt=""
            fill
            sizes="(min-width: 1024px) 22rem, (min-width: 640px) 50vw, 100vw"
            className="object-cover"
            priority={priority}
          />
        ) : (
          <CategoryIcon name={event.category.icon} className="size-10 text-muted-foreground" />
        )}
      </div>
      <div className="grid flex-1 content-start gap-2 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary">{event.category.name}</Badge>
          {status !== "PUBLISHED" && <EventStatusBadge status={status} />}
          {status === "PUBLISHED" && left === 0 && <Badge variant="outline">Full</Badge>}
        </div>
        <h3 className="leading-snug font-semibold">
          {/* The whole card is clickable through this one link. */}
          <Link
            href={`/events/${event.slug}`}
            className="outline-none after:absolute after:inset-0"
          >
            {event.title}
          </Link>
        </h3>
        {event.subEvent && <p className="text-sm text-muted-foreground">{event.subEvent}</p>}
        <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
          <CalendarIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          {formatDateTime(event.startsAt)}
        </p>
        {event.venue && (
          <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
            <MapPinIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
            {event.venue.name}
          </p>
        )}
        {status === "PUBLISHED" && left !== null && left > 0 && (
          <p className="text-xs text-muted-foreground">
            {left} seat{left === 1 ? "" : "s"} left
          </p>
        )}
      </div>
    </Card>
  );
}
