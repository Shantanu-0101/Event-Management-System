import { Suspense } from "react";
import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { ChevronLeftIcon } from "lucide-react";
import { STAFF_ROLES } from "@/lib/access";
import { formatDateTime } from "@/lib/time";
import { countAudience, listAnnouncements } from "@/server/services/announcements";
import { canManageEvent, getEventForEdit } from "@/server/services/events";
import { requireRole } from "@/server/session";
import { ButtonLink } from "@/components/button-link";
import { Skeleton } from "@/components/ui/skeleton";
import { AnnouncementForm } from "./announcement-form";

export const metadata: Metadata = { title: "Announcements" };

type Props = PageProps<"/manage/events/[id]/announcements">;

export default function AnnouncementsPage({ params }: Props) {
  return (
    <div className="mx-auto grid max-w-2xl grid-cols-[minmax(0,1fr)] gap-6 px-4 py-10">
      <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
        <AnnouncementsContent params={params} />
      </Suspense>
    </div>
  );
}

async function AnnouncementsContent({ params }: Pick<Props, "params">) {
  const { id } = await params;
  const me = await requireRole(STAFF_ROLES, `/manage/events/${id}/announcements`);
  const event = await getEventForEdit(id);
  if (!event) notFound();
  if (!canManageEvent(me, event)) forbidden();

  const [audience, sent] = await Promise.all([countAudience(id), listAnnouncements(id)]);

  return (
    <>
      <div className="grid gap-2">
        <ButtonLink href={`/manage/events/${id}`} variant="ghost" size="sm" className="w-fit">
          <ChevronLeftIcon data-icon="inline-start" /> Event
        </ButtonLink>
        <h1 className="text-2xl font-semibold break-words">{event.title}</h1>
        <p className="text-sm text-muted-foreground">
          Send a message by email and to the notification bell.
        </p>
      </div>

      {event.status === "DRAFT" ? (
        <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
          This event isn&apos;t published yet, so nobody has registered.
        </p>
      ) : audience === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
          Nobody has registered yet, so there&apos;s nobody to send to.
        </p>
      ) : (
        <section className="rounded-xl border p-4">
          <AnnouncementForm eventId={id} audience={audience} />
        </section>
      )}

      {sent.length > 0 && (
        <section className="grid gap-3">
          <h2 className="font-semibold">Sent</h2>
          <ul className="grid gap-3">
            {sent.map((a) => (
              <li key={a.id} className="grid gap-1 rounded-xl border p-4 text-sm">
                <p className="font-medium break-words">{a.subject}</p>
                <p className="break-words whitespace-pre-line">{a.body}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(a.sentAt)}
                  {a.sentBy && ` by ${a.sentBy}`} · {a.recipients}{" "}
                  {a.recipients === 1 ? "person" : "people"}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
