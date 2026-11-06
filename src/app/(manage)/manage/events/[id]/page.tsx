import { Suspense } from "react";
import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { ExternalLinkIcon } from "lucide-react";
import { STAFF_ROLES } from "@/lib/access";
import {
  effectiveStatus,
  eligibilityChoice,
  isEditable,
  publishProblem,
  statusActions,
} from "@/lib/events";
import { toLocalInput } from "@/lib/time";
import { requireRole } from "@/server/session";
import { canManageEvent, getEventForEdit, getEventFormOptions } from "@/server/services/events";
import { ButtonLink } from "@/components/button-link";
import { EventStatusBadge } from "@/components/event-status-badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { EditPage } from "../../edit-page";
import { SavedNotice } from "../../saved-notice";
import { DuplicateEventButton, StatusActionButton } from "../event-actions";
import { EventForm } from "../event-form";

export const metadata: Metadata = { title: "Edit event" };

const NOTICES: Record<string, string> = {
  "1": "Saved.",
  copy: "Copy made as a draft. Check its dates before publishing.",
  publish: "Published. It's on the public events page now.",
  close: "Registration closed.",
  reopen: "Registration reopened.",
  cancel: "Event cancelled.",
};

export default function EditEventPage({ params, searchParams }: PageProps<"/manage/events/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto mt-10 h-96 max-w-2xl rounded-xl" />}>
      <EditEventContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function EditEventContent({
  params,
  searchParams,
}: Pick<PageProps<"/manage/events/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  const me = await requireRole(STAFF_ROLES, `/manage/events/${id}`);
  const event = await getEventForEdit(id);
  if (!event) notFound();
  if (!canManageEvent(me, event)) forbidden();

  const { saved } = await searchParams;
  const notice = typeof saved === "string" ? NOTICES[saved] : undefined;

  const now = new Date();
  const status = effectiveStatus(event, now);
  const actions = statusActions(event, me.role, now);
  const editable = isEditable(event, now);
  const isAdmin = me.role === "ADMIN";
  const problem = isAdmin && event.status === "DRAFT" ? publishProblem(event, now) : null;
  const { departmentIds, years } = eligibilityChoice(event.eligibility);

  return (
    <EditPage backHref="/manage/events" backLabel="Events" title={event.title}>
      <div className="grid gap-6">
        {notice && <SavedNotice text={notice} />}

        <section aria-label="Status" className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <EventStatusBadge status={status} />
            <ButtonLink
              href={`/events/${event.slug}`}
              variant="link"
              size="sm"
              className="h-auto px-0"
            >
              {status === "DRAFT" ? "Preview page" : "View page"}{" "}
              <ExternalLinkIcon data-icon="inline-end" />
            </ButtonLink>
            {status !== "DRAFT" && (
              <>
                <ButtonLink
                  href={`/manage/events/${event.id}/registrations`}
                  variant="link"
                  size="sm"
                  className="h-auto px-0"
                >
                  Registrations
                </ButtonLink>
                <ButtonLink
                  href={`/manage/check-in/${event.id}`}
                  variant="link"
                  size="sm"
                  className="h-auto px-0"
                >
                  Check-in
                </ButtonLink>
              </>
            )}
          </div>
          {problem && (
            <p className="text-sm text-muted-foreground">Can&apos;t publish: {problem}</p>
          )}
          {(actions.length > 0 || isAdmin) && (
            <div className="flex flex-wrap gap-2">
              {actions.map((action) => (
                <StatusActionButton key={action} eventId={event.id} action={action} />
              ))}
              {isAdmin && <DuplicateEventButton eventId={event.id} />}
            </div>
          )}
        </section>

        <Separator />

        {editable ? (
          <EventForm
            // A fresh form after each save, so it shows what was really stored.
            key={event.updatedAt.toISOString()}
            canAssignCoordinators={isAdmin}
            options={await getEventFormOptions(event.categoryId)}
            event={{
              id: event.id,
              title: event.title,
              categoryId: event.categoryId,
              subEvent: event.subEvent,
              description: event.description,
              posterUrl: event.posterUrl,
              rulesUrl: event.rulesUrl,
              venueId: event.venueId,
              startsAt: toLocalInput(event.startsAt),
              endsAt: toLocalInput(event.endsAt),
              regOpensAt: toLocalInput(event.regOpensAt),
              regClosesAt: toLocalInput(event.regClosesAt),
              capacity: event.capacity,
              participation: event.participation,
              teamMin: event.teamMin,
              teamMax: event.teamMax,
              seatPer: event.seatPer,
              departmentIds,
              years,
              coordinatorIds: event.coordinators.map((c) => c.userId),
            }}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            {status === "CANCELLED" ? "Cancelled" : "Completed"} events are kept as a record and
            can&apos;t be changed.
            {isAdmin && " Duplicate this one to run it again."}
          </p>
        )}
      </div>
    </EditPage>
  );
}
