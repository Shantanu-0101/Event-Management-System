import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { STAFF_ROLES } from "@/lib/access";
import { formatDateTime } from "@/lib/time";
import { listCheckInEvents } from "@/server/services/check-in";
import { requireRole } from "@/server/session";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Check-in" };

export default function CheckInEventsPage() {
  return (
    <div className="mx-auto grid max-w-2xl grid-cols-[minmax(0,1fr)] gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold">Check-in</h1>
        <p className="text-sm text-muted-foreground">Pick an event to start scanning tickets.</p>
      </div>
      <Suspense fallback={<Skeleton className="h-48 rounded-xl" />}>
        <CheckInEventsContent />
      </Suspense>
    </div>
  );
}

async function CheckInEventsContent() {
  const me = await requireRole(STAFF_ROLES, "/manage/check-in");
  const events = await listCheckInEvents(me, new Date());
  const open = events.filter((e) => !e.closedReason);
  const later = events.filter((e) => e.closedReason);

  if (events.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
        {me.role === "ADMIN"
          ? "No published events are coming up."
          : "You have no events coming up. An admin assigns you to events."}
      </p>
    );
  }

  return (
    <>
      <section className="grid gap-3">
        <h2 className="font-semibold">Open now</h2>
        {open.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            None yet. Check-in opens a day before an event starts.
          </p>
        ) : (
          <ul className="grid gap-3">
            {open.map((event) => (
              <li key={event.id}>
                <Link
                  href={`/manage/check-in/${event.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border p-4 hover:bg-muted"
                >
                  <div className="min-w-0">
                    <p className="font-medium break-words">{event.title}</p>
                    {event.subEvent && (
                      <p className="text-sm break-words text-muted-foreground">{event.subEvent}</p>
                    )}
                    <p className="text-sm text-muted-foreground">
                      {formatDateTime(event.startsAt)}
                      {event.venue && ` · ${event.venue.name}`}
                    </p>
                    <p className="mt-1 text-sm">
                      {event.checkedIn} of {event.registered} checked in
                    </p>
                  </div>
                  <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {later.length > 0 && (
        <section className="grid gap-3">
          <h2 className="font-semibold">Coming up</h2>
          <ul className="divide-y rounded-xl border">
            {later.map((event) => (
              <li key={event.id} className="p-4">
                <p className="font-medium break-words">{event.title}</p>
                <p className="text-sm text-muted-foreground">{event.closedReason}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
