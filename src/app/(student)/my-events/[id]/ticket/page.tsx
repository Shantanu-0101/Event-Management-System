import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChevronLeftIcon, CircleCheckIcon } from "lucide-react";
import QRCode from "qrcode";
import { formatTicketCode } from "@/lib/check-in";
import { effectiveStatus } from "@/lib/events";
import { formatDateTime, formatRange } from "@/lib/time";
import { getTicket } from "@/server/services/registrations";
import { requireUser } from "@/server/session";
import { ButtonLink } from "@/components/button-link";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Your ticket" };

export default function TicketPage({ params }: PageProps<"/my-events/[id]/ticket">) {
  return (
    <div className="mx-auto grid max-w-md grid-cols-[minmax(0,1fr)] gap-4 px-4 py-6">
      <ButtonLink href="/my-events" variant="ghost" size="sm" className="w-fit">
        <ChevronLeftIcon data-icon="inline-start" /> My events
      </ButtonLink>
      <Suspense fallback={<Skeleton className="h-[34rem] rounded-xl" />}>
        <TicketContent params={params} />
      </Suspense>
    </div>
  );
}

async function TicketContent({ params }: Pick<PageProps<"/my-events/[id]/ticket">, "params">) {
  const { id } = await params;
  const me = await requireUser(`/my-events/${id}/ticket`);
  const ticket = await getTicket(id, me.id);
  // Someone else's ticket looks the same as one that doesn't exist.
  if (!ticket) notFound();

  const { event } = ticket;
  const status = effectiveStatus(event, new Date());

  return (
    <article className="grid gap-4 rounded-xl border p-5">
      <header>
        <h1 className="text-xl font-semibold break-words">{event.title}</h1>
        {event.subEvent && <p className="text-sm text-muted-foreground">{event.subEvent}</p>}
        <p className="mt-2 text-sm">{formatRange(event.startsAt, event.endsAt)}</p>
        {event.venue && (
          <p className="text-sm text-muted-foreground">
            {event.venue.name}
            {event.venue.building && `, ${event.venue.building}`}
          </p>
        )}
      </header>

      <TicketBody
        code={ticket.ticketCode}
        registered={ticket.status === "CONFIRMED"}
        waitlisted={ticket.status === "WAITLISTED"}
        cancelled={status === "CANCELLED"}
        over={status === "COMPLETED"}
        checkedInAt={ticket.checkedInAt}
      />

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 border-t pt-4 text-sm">
        <dt className="text-muted-foreground">Name</dt>
        <dd className="font-medium break-words">{ticket.user.name}</dd>
        {ticket.user.rollNo && (
          <>
            <dt className="text-muted-foreground">Roll no</dt>
            <dd>{ticket.user.rollNo}</dd>
          </>
        )}
        {ticket.team && (
          <>
            <dt className="text-muted-foreground">Team</dt>
            <dd className="break-words">{ticket.team.name}</dd>
          </>
        )}
      </dl>
    </article>
  );
}

async function TicketBody({
  code,
  registered,
  waitlisted,
  cancelled,
  over,
  checkedInAt,
}: {
  code: string | null;
  registered: boolean;
  waitlisted: boolean;
  cancelled: boolean;
  over: boolean;
  checkedInAt: Date | null;
}) {
  if (cancelled)
    return <Message>This event was cancelled, so this ticket no longer works.</Message>;
  if (waitlisted) {
    return <Message>You&apos;re on the waitlist. You get a ticket if a seat opens up.</Message>;
  }
  if (!registered || !code) {
    return <Message>You cancelled this registration, so there&apos;s no ticket.</Message>;
  }

  const checkedIn = checkedInAt && (
    <p className="flex items-center gap-2 text-sm font-medium">
      <CircleCheckIcon className="size-4 shrink-0 text-primary" aria-hidden />
      Checked in {formatDateTime(checkedInAt)}
    </p>
  );
  if (over) return checkedIn || <Message>This event is over.</Message>;

  const qr = await QRCode.toString(code, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
    color: { dark: "#000000", light: "#ffffff" },
  });

  return (
    <div className="grid justify-items-center gap-3">
      {checkedIn}
      {/* White in both themes: scanners need dark squares on a light background. */}
      <div
        role="img"
        aria-label="QR code of your ticket"
        className="aspect-square w-full max-w-72 rounded-lg bg-white p-1"
        // The SVG comes from the QR library and only encodes our own ticket code.
        dangerouslySetInnerHTML={{ __html: qr }}
      />
      <p className="font-mono text-base font-medium tracking-wider">{formatTicketCode(code)}</p>
      <p className="text-center text-sm text-muted-foreground">
        Show this at the entrance, and don&apos;t share it: it can only be used once. Take a
        screenshot in case the signal is weak there.
      </p>
    </div>
  );
}

function Message({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg bg-muted p-4 text-sm">{children}</p>;
}
