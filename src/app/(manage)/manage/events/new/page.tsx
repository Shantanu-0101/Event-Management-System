import { Suspense } from "react";
import type { Metadata } from "next";
import { ADMIN_ONLY } from "@/lib/access";
import { requireRole } from "@/server/session";
import { getEventFormOptions } from "@/server/services/events";
import { Skeleton } from "@/components/ui/skeleton";
import { EditPage } from "../../edit-page";
import { EventForm } from "../event-form";

export const metadata: Metadata = { title: "New event" };

export default function NewEventPage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto mt-10 h-96 max-w-2xl rounded-xl" />}>
      <NewEventContent />
    </Suspense>
  );
}

async function NewEventContent() {
  await requireRole(ADMIN_ONLY, "/manage/events/new");
  const options = await getEventFormOptions();

  return (
    <EditPage backHref="/manage/events" backLabel="Events" title="New event">
      <EventForm options={options} canAssignCoordinators />
    </EditPage>
  );
}
