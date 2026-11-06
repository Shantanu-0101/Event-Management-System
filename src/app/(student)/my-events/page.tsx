import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { effectiveStatus } from "@/lib/events";
import { groupMyEvents, membersNeeded, windowProblem } from "@/lib/registrations";
import { formatDateTime } from "@/lib/time";
import { acceptInviteAction, declineInviteAction } from "@/server/actions/registrations";
import { getMyEvents } from "@/server/services/registrations";
import { requireUser } from "@/server/session";
import { ButtonLink } from "@/components/button-link";
import { ActionButton } from "@/components/registration-actions";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "My events" };

export default function MyEventsPage() {
  return (
    <div className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-8 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold">My events</h1>
        <p className="text-sm text-muted-foreground">
          What you&apos;ve registered for, and where you stand.
        </p>
      </div>
      <Suspense fallback={<MyEventsSkeleton />}>
        <MyEventsContent />
      </Suspense>
    </div>
  );
}

async function MyEventsContent() {
  const user = await requireUser("/my-events");
  const now = new Date();
  const { registrations, invites, teams } = await getMyEvents(user.id);
  const { upcoming, waitlisted, past } = groupMyEvents(registrations, now);

  // An invite only means something while it can still be accepted.
  const openInvites = invites.filter((invite) => !windowProblem(invite.event, now));
  const formingTeams = teams.filter((team) => {
    const status = effectiveStatus(team.event, now);
    return status !== "COMPLETED" && status !== "CANCELLED";
  });

  const empty =
    upcoming.length + waitlisted.length + past.length + openInvites.length + formingTeams.length ===
    0;

  if (empty) {
    return (
      <div className="grid justify-items-center gap-3 rounded-xl border border-dashed p-10 text-center">
        <p className="text-sm text-muted-foreground">
          You haven&apos;t registered for anything yet.
        </p>
        <ButtonLink href="/events">Browse events</ButtonLink>
      </div>
    );
  }

  return (
    <>
      {openInvites.length > 0 && (
        <Section title="Team invites">
          {openInvites.map((invite) => (
            <Row
              key={invite.id}
              event={invite.event}
              note={`${invite.leader.name} invited you to team ${invite.name}.`}
              actions={
                <div className="flex flex-wrap gap-2">
                  <ActionButton
                    action={acceptInviteAction}
                    fields={{ teamId: invite.id }}
                    size="sm"
                  >
                    Accept
                  </ActionButton>
                  <ActionButton
                    action={declineInviteAction}
                    fields={{ teamId: invite.id }}
                    variant="outline"
                    size="sm"
                  >
                    Decline
                  </ActionButton>
                </div>
              }
            />
          ))}
        </Section>
      )}

      {upcoming.length > 0 && (
        <Section title="Upcoming">
          {upcoming.map((r) => (
            <Row
              key={r.id}
              event={r.event}
              note={r.team ? `Team ${r.team.name}` : undefined}
              badge={<Badge>Registered</Badge>}
            />
          ))}
        </Section>
      )}

      {waitlisted.length > 0 && (
        <Section title="Waitlisted">
          {waitlisted.map((r) => (
            <Row
              key={r.id}
              event={r.event}
              note={r.team ? `Team ${r.team.name}` : undefined}
              badge={<Badge variant="secondary">Number {r.waitlistRank} in line</Badge>}
            />
          ))}
        </Section>
      )}

      {formingTeams.length > 0 && (
        <Section title="Teams still forming">
          {formingTeams.map((team) => {
            const needed = membersNeeded(team._count.members, team.event.teamMin);
            return (
              <Row
                key={team.id}
                event={team.event}
                note={`Team ${team.name}`}
                badge={
                  <Badge variant="outline">
                    {effectiveStatus(team.event, now) === "PUBLISHED"
                      ? `${needed} more needed`
                      : "Not registered"}
                  </Badge>
                }
              />
            );
          })}
        </Section>
      )}

      {past.length > 0 && (
        <Section title="Past">
          {past.map((r) => {
            const cancelled = effectiveStatus(r.event, now) === "CANCELLED";
            return (
              <Row
                key={r.id}
                event={r.event}
                note={r.team ? `Team ${r.team.name}` : undefined}
                badge={
                  <Badge variant="outline">
                    {cancelled
                      ? "Event cancelled"
                      : r.status === "WAITLISTED"
                        ? "Didn't get a seat"
                        : "Registered"}
                  </Badge>
                }
              />
            );
          })}
        </Section>
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3">
      <h2 className="font-semibold">{title}</h2>
      <ul className="grid gap-3">{children}</ul>
    </section>
  );
}

function Row({
  event,
  note,
  badge,
  actions,
}: {
  event: {
    title: string;
    slug: string;
    subEvent: string | null;
    startsAt: Date;
    venue: { name: string } | null;
  };
  note?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <li className="grid gap-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={`/events/${event.slug}`}
            className="font-medium break-words underline-offset-4 hover:underline"
          >
            {event.title}
          </Link>
          {event.subEvent && <p className="text-sm text-muted-foreground">{event.subEvent}</p>}
        </div>
        {badge}
      </div>
      <p className="text-sm text-muted-foreground">
        {formatDateTime(event.startsAt)}
        {event.venue && ` · ${event.venue.name}`}
      </p>
      {note && <p className="text-sm break-words">{note}</p>}
      {actions}
    </li>
  );
}

function MyEventsSkeleton() {
  return (
    <div className="grid gap-3" aria-busy="true">
      <Skeleton className="h-6 w-32 rounded-lg" />
      <Skeleton className="h-24 rounded-xl" />
      <Skeleton className="h-24 rounded-xl" />
    </div>
  );
}
