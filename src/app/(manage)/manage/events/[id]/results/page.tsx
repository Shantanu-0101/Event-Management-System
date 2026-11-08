import { Suspense } from "react";
import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { ChevronLeftIcon, DownloadIcon, StarIcon } from "lucide-react";
import { STAFF_ROLES } from "@/lib/access";
import { afterEventProblem } from "@/lib/certificates";
import { formatDateTime } from "@/lib/time";
import { generateCertificatesAction } from "@/server/actions/after-event";
import { getCertificateCounts } from "@/server/services/certificates";
import { canManageEvent, getEventForEdit } from "@/server/services/events";
import { getFeedbackSummary } from "@/server/services/feedback";
import { getCurrentPicks, getWinnerChoices } from "@/server/services/results";
import { requireRole } from "@/server/session";
import { ButtonLink } from "@/components/button-link";
import { ActionButton } from "@/components/registration-actions";
import { StatTile } from "@/components/stat-tile";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ResultsForm, TemplateForm } from "./results-forms";

export const metadata: Metadata = { title: "Results and certificates" };

type Props = PageProps<"/manage/events/[id]/results">;

export default function ResultsPage({ params }: Props) {
  return (
    <div className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-8 px-4 py-10">
      <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
        <ResultsContent params={params} />
      </Suspense>
    </div>
  );
}

async function ResultsContent({ params }: Pick<Props, "params">) {
  const { id } = await params;
  const me = await requireRole(STAFF_ROLES, `/manage/events/${id}/results`);
  const event = await getEventForEdit(id);
  if (!event) notFound();
  if (!canManageEvent(me, event)) forbidden();

  const closed = afterEventProblem(event, new Date());
  const cancelled = event.status === "CANCELLED";

  return (
    <>
      <div className="grid gap-2">
        <ButtonLink href={`/manage/events/${id}`} variant="ghost" size="sm" className="w-fit">
          <ChevronLeftIcon data-icon="inline-start" /> Event
        </ButtonLink>
        <h1 className="text-2xl font-semibold break-words">{event.title}</h1>
        <p className="text-sm text-muted-foreground">Results, certificates and feedback</p>
      </div>

      {closed ? (
        <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
          {cancelled
            ? "This event was cancelled, so it has no results or certificates."
            : `Results, certificates and feedback open when the event ends, on ${formatDateTime(event.endsAt)}.`}
        </p>
      ) : (
        <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
          <ResultsAndCertificates eventId={id} />
        </Suspense>
      )}

      {!cancelled && (
        <Section
          title="Certificate design"
          note={
            event.certificateTemplateUrl
              ? "This event's certificates use an uploaded template."
              : "This event's certificates use the built-in design."
          }
        >
          {me.role === "ADMIN" ? (
            <TemplateForm eventId={id} hasTemplate={event.certificateTemplateUrl !== null} />
          ) : (
            <p className="text-sm text-muted-foreground">Only admins can change the design.</p>
          )}
          <div className="flex flex-wrap gap-2">
            {(["PARTICIPATION", "MERIT"] as const).map((type) => (
              <a
                key={type}
                href={`/api/v1/events/${id}/certificates?sample=${type}`}
                download
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <DownloadIcon data-icon="inline-start" /> Sample:{" "}
                {type === "MERIT" ? "merit" : "participation"}
              </a>
            ))}
          </div>
        </Section>
      )}

      {!closed && (
        <Suspense fallback={<Skeleton className="h-40 rounded-xl" />}>
          <Feedback eventId={id} />
        </Suspense>
      )}
    </>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-4 rounded-xl border p-4">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {note && <p className="text-sm text-muted-foreground">{note}</p>}
      </div>
      {children}
    </section>
  );
}

async function ResultsAndCertificates({ eventId }: { eventId: string }) {
  const [choices, picks, counts] = await Promise.all([
    getWinnerChoices(eventId),
    getCurrentPicks(eventId),
    getCertificateCounts(eventId),
  ]);

  return (
    <>
      <Section title="Results" note="They show on the public event page once saved.">
        {choices.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nobody was checked in at this event, so there&apos;s nobody to choose from.
          </p>
        ) : (
          <ResultsForm eventId={eventId} choices={choices} picks={picks} />
        )}
      </Section>

      <Section
        title="Certificates"
        note="Everyone checked in gets a participation certificate, and winners get a merit certificate too. Enter results first."
      >
        <dl className="grid grid-cols-2 gap-3">
          <StatTile label="Issued" value={counts.issued} />
          <StatTile label="Ready to issue" value={counts.waiting} />
        </dl>
        <div className="flex flex-wrap gap-2">
          {counts.waiting > 0 && (
            <ActionButton action={generateCertificatesAction} fields={{ eventId }}>
              Issue {counts.waiting} certificate{counts.waiting === 1 ? "" : "s"}
            </ActionButton>
          )}
          {counts.issued > 0 && (
            // A plain link, not <Link>: a prefetch would write a false export to the audit log.
            <a
              href={`/api/v1/events/${eventId}/certificates`}
              download
              className={buttonVariants({ variant: "outline" })}
            >
              <DownloadIcon data-icon="inline-start" /> Download all for printing
            </a>
          )}
        </div>
      </Section>
    </>
  );
}

async function Feedback({ eventId }: { eventId: string }) {
  const { average, count, comments, commentLimit } = await getFeedbackSummary(eventId);
  return (
    <Section title="Feedback" note="Shown without names, so people can be honest.">
      {count === 0 ? (
        <p className="text-sm text-muted-foreground">Nobody has left feedback yet.</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3">
            <StatTile label="Average rating" value={`${average?.toFixed(1)} / 5`} />
            <StatTile label="Ratings" value={count} />
          </dl>
          {comments.length > 0 && (
            <ul className="grid gap-2">
              {comments.map((c) => (
                <li key={c.id} className="grid gap-1 rounded-lg bg-muted p-3 text-sm">
                  <span className="flex items-center gap-1 text-xs">
                    <StarIcon className="size-3" aria-hidden /> {c.rating} of 5
                  </span>
                  <p className="break-words whitespace-pre-line">{c.comment}</p>
                </li>
              ))}
            </ul>
          )}
          {comments.length === commentLimit && (
            <p className="text-xs text-muted-foreground">Showing the latest {commentLimit}.</p>
          )}
        </>
      )}
    </Section>
  );
}
