import { Suspense } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import {
  CalendarIcon,
  CalendarPlusIcon,
  ChevronLeftIcon,
  CircleAlertIcon,
  EyeOffIcon,
  FileTextIcon,
  TrophyIcon,
  MapPinIcon,
  TicketIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import { afterEventProblem } from "@/lib/certificates";
import {
  effectiveStatus,
  eligibilityChoice,
  registrationNote,
  seatsLeft,
  seatsTaken,
} from "@/lib/events";
import { richTextToPlain } from "@/lib/rich-text";
import { formatRange } from "@/lib/time";
import { yearLabel } from "@/lib/years";
import { getCurrentUser, type CurrentUser } from "@/server/session";
import { canManageEvent, getEventBySlug } from "@/server/services/events";
import { getFeedbackState } from "@/server/services/feedback";
import { getPublicResults } from "@/server/services/results";
import { ButtonLink } from "@/components/button-link";
import { CategoryIcon } from "@/components/category-icon";
import { EventStatusBadge } from "@/components/event-status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FeedbackForm } from "./feedback-form";
import { RegistrationPanel } from "./registration-panel";

export async function generateMetadata({ params }: PageProps<"/events/[slug]">): Promise<Metadata> {
  await connection();
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  // A draft's details stay private, even in a link preview.
  if (!event || event.status === "DRAFT") return { title: "Event" };

  const description = richTextToPlain(event.description).slice(0, 160);
  return {
    title: event.title,
    description,
    openGraph: {
      title: event.title,
      description,
      images: event.posterUrl ? [event.posterUrl] : undefined,
    },
  };
}

export default function EventPage({ params }: PageProps<"/events/[slug]">) {
  return (
    <Suspense fallback={<EventSkeleton />}>
      <EventContent params={params} />
    </Suspense>
  );
}

async function EventContent({ params }: Pick<PageProps<"/events/[slug]">, "params">) {
  await connection();
  const { slug } = await params;
  const [event, user] = await Promise.all([getEventBySlug(slug), getCurrentUser()]);
  if (!event) notFound();

  const canManage = user !== null && canManageEvent(user, event);
  // Drafts exist only for the people preparing them.
  if (event.status === "DRAFT" && !canManage) notFound();

  const now = new Date();
  const status = effectiveStatus(event, now);
  const left = seatsLeft(event.capacity, seatsTaken(event));
  const { departmentIds, years } = eligibilityChoice(event.eligibility);
  const departmentCodes = departmentIds.map(
    (id) => event.eligibility.find((r) => r.departmentId === id)?.department?.code ?? "",
  );
  const venue = event.venue
    ? [event.venue.name, event.venue.building].filter(Boolean).join(", ")
    : "To be announced";
  const showsCalendar = status !== "DRAFT" && status !== "CANCELLED";

  return (
    <article className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-6 px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ButtonLink href="/events" variant="ghost" size="sm" className="w-fit">
          <ChevronLeftIcon data-icon="inline-start" /> Events
        </ButtonLink>
        {canManage && (
          <ButtonLink href={`/manage/events/${event.id}`} variant="outline" size="sm">
            Edit event
          </ButtonLink>
        )}
      </div>

      {status === "DRAFT" && (
        <Alert>
          <EyeOffIcon />
          <AlertDescription className="text-foreground">
            This is a draft. Only admins and this event&apos;s coordinators can see it.
          </AlertDescription>
        </Alert>
      )}
      {status === "CANCELLED" && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertDescription>This event has been cancelled.</AlertDescription>
        </Alert>
      )}

      <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-muted">
        {event.posterUrl ? (
          <Image
            src={event.posterUrl}
            alt={`Poster for ${event.title}`}
            fill
            priority
            sizes="(min-width: 768px) 46rem, 100vw"
            className="object-cover"
          />
        ) : (
          <CategoryIcon name={event.category.icon} className="size-16 text-muted-foreground" />
        )}
      </div>

      <header className="grid gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary">{event.category.name}</Badge>
          <EventStatusBadge status={status} />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{event.title}</h1>
        {event.subEvent && <p className="text-muted-foreground">{event.subEvent}</p>}
      </header>

      <dl className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2">
        <Fact icon={CalendarIcon} label="When">
          {formatRange(event.startsAt, event.endsAt)}
        </Fact>
        <Fact icon={MapPinIcon} label="Where">
          {venue}
        </Fact>
        <Fact icon={TicketIcon} label="Registration">
          {registrationNote(event, now)}
          {left !== null && status === "PUBLISHED" && (
            <span className="block text-muted-foreground">
              {left === 0 ? "No seats left" : `${left} of ${event.capacity} seats left`}
            </span>
          )}
        </Fact>
        <Fact icon={UsersIcon} label="Who can join">
          {event.participation === "TEAM"
            ? `Teams of ${teamSize(event.teamMin, event.teamMax)}`
            : "Individuals"}
          <span className="block text-muted-foreground">
            {departmentCodes.length > 0 ? departmentCodes.join(", ") : "All departments"} ·{" "}
            {years.length > 0 ? years.map(yearLabel).join(", ") : "All years"}
          </span>
        </Fact>
      </dl>

      {status === "COMPLETED" && <Results eventId={event.id} />}

      <RegistrationPanel event={event} user={user} seatsLeft={left} now={now} />

      {user && !afterEventProblem(event, now) && <Feedback eventId={event.id} user={user} />}

      <div className="flex flex-wrap gap-2">
        {showsCalendar && (
          <a
            href={`/events/${event.slug}/calendar.ics`}
            download
            className={buttonVariants({ variant: "outline" })}
          >
            <CalendarPlusIcon data-icon="inline-start" /> Add to calendar
          </a>
        )}
        {event.rulesUrl && (
          <a
            href={event.rulesUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "outline" })}
          >
            <FileTextIcon data-icon="inline-start" /> Rules (PDF)
          </a>
        )}
      </div>

      <section aria-labelledby="about-heading" className="grid gap-2">
        <h2 id="about-heading" className="text-lg font-semibold">
          About this event
        </h2>
        {/* Cleaned by lib/rich-text.ts before it was saved. */}
        <div className="rich-text" dangerouslySetInnerHTML={{ __html: event.description }} />
      </section>

      {event.coordinators.length > 0 && (
        <section aria-labelledby="coordinators-heading" className="grid gap-2">
          <h2 id="coordinators-heading" className="text-lg font-semibold">
            Coordinators
          </h2>
          <ul className="grid gap-2 text-sm">
            {event.coordinators.map(({ userId, user: c }) => (
              <li key={userId}>
                <span className="font-medium">{c.name}</span>
                {/* Contact details are for signed-in people, not for scrapers. */}
                {user && (
                  <span className="block text-muted-foreground">
                    <a href={`mailto:${c.email}`} className="underline underline-offset-4">
                      {c.email}
                    </a>
                    {c.phone && (
                      <>
                        {" · "}
                        <a href={`tel:${c.phone}`} className="underline underline-offset-4">
                          {c.phone}
                        </a>
                      </>
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {!user && (
            <p className="text-xs text-muted-foreground">Log in to see how to contact them.</p>
          )}
        </section>
      )}
    </article>
  );
}

async function Results({ eventId }: { eventId: string }) {
  const results = await getPublicResults(eventId);
  if (results.length === 0) return null;
  return (
    <section aria-labelledby="results-heading" className="grid gap-3 rounded-xl border p-4">
      <h2 id="results-heading" className="flex items-center gap-2 font-semibold">
        <TrophyIcon className="size-4 text-muted-foreground" aria-hidden /> Results
      </h2>
      <ol className="grid gap-2 text-sm">
        {results.map(({ place, winner }) => (
          <li key={place} className="flex gap-3">
            <span className="w-8 shrink-0 font-medium">{place}</span>
            <span className="min-w-0 break-words">{winner}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Attendees rate a finished event once. Everyone else sees nothing here. */
async function Feedback({ eventId, user }: { eventId: string; user: CurrentUser }) {
  const { attended, feedback } = await getFeedbackState(eventId, user.id);
  if (!attended) return null;
  return (
    <section
      id="feedback"
      aria-labelledby="feedback-heading"
      className="grid scroll-mt-20 gap-3 rounded-xl border p-4"
    >
      <h2 id="feedback-heading" className="font-semibold">
        How was it?
      </h2>
      {feedback ? (
        <p className="text-sm text-muted-foreground">
          Thanks. You rated this event {feedback.rating} out of 5.
        </p>
      ) : (
        <FeedbackForm eventId={eventId} />
      )}
    </section>
  );
}

function teamSize(min: number | null, max: number | null) {
  return min === max ? String(min) : `${min} to ${max}`;
}

function Fact({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 text-sm">
      <dt className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-4 shrink-0" aria-hidden />
        {label}
      </dt>
      <dd className="pl-6">{children}</dd>
    </div>
  );
}

function EventSkeleton() {
  return (
    <div className="mx-auto grid max-w-3xl gap-6 px-4 py-10" aria-busy="true">
      <Skeleton className="h-7 w-24 rounded-lg" />
      <Skeleton className="aspect-video rounded-xl" />
      <Skeleton className="h-9 w-2/3 rounded-lg" />
      <Skeleton className="h-32 rounded-xl" />
    </div>
  );
}
