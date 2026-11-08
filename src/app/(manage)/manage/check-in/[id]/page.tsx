import { Suspense } from "react";
import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { ChevronLeftIcon } from "lucide-react";
import { STAFF_ROLES } from "@/lib/access";
import { checkInProblem } from "@/lib/check-in";
import { requireRole } from "@/server/session";
import { getCheckInCounts } from "@/server/services/check-in";
import { canManageEvent, getEventForEdit } from "@/server/services/events";
import { ButtonLink } from "@/components/button-link";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckInDesk } from "./check-in-desk";

export const metadata: Metadata = { title: "Check-in" };

export default function CheckInPage({ params }: PageProps<"/manage/check-in/[id]">) {
  return (
    <div className="mx-auto grid max-w-md grid-cols-[minmax(0,1fr)] gap-4 px-4 py-4">
      <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
        <CheckInContent params={params} />
      </Suspense>
    </div>
  );
}

async function CheckInContent({ params }: Pick<PageProps<"/manage/check-in/[id]">, "params">) {
  const { id } = await params;
  const me = await requireRole(STAFF_ROLES, `/manage/check-in/${id}`);
  const event = await getEventForEdit(id);
  if (!event) notFound();
  if (!canManageEvent(me, event)) forbidden();

  const closed = checkInProblem(event, new Date());

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ButtonLink href="/manage/check-in" variant="ghost" size="sm" className="w-fit">
          <ChevronLeftIcon data-icon="inline-start" /> Check-in
        </ButtonLink>
        <ButtonLink href={`/manage/events/${id}/registrations`} variant="ghost" size="sm">
          Registrations
        </ButtonLink>
      </div>
      <h1 className="text-xl font-semibold break-words">{event.title}</h1>
      {closed ? (
        <p className="rounded-lg bg-muted p-4 text-sm">{closed}</p>
      ) : (
        <CheckInDesk eventId={id} initialCounts={await getCheckInCounts(id)} />
      )}
    </>
  );
}
