import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ADMIN_ONLY } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/server/session";
import { Skeleton } from "@/components/ui/skeleton";
import { EditPage } from "../../edit-page";
import { VenueForm } from "../../master-data-forms";

export const metadata: Metadata = { title: "Edit venue" };

export default function EditVenuePage({ params }: PageProps<"/manage/venues/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto mt-10 h-96 max-w-2xl rounded-xl" />}>
      <EditContent params={params} />
    </Suspense>
  );
}

async function EditContent({ params }: Pick<PageProps<"/manage/venues/[id]">, "params">) {
  const { id } = await params;
  await requireRole(ADMIN_ONLY, `/manage/venues/${id}`);
  const venue = await prisma.venue.findUnique({ where: { id } });
  if (!venue) notFound();

  return (
    <EditPage backHref="/manage/venues" backLabel="Venues" title={`Edit ${venue.name}`}>
      <VenueForm venue={venue} />
    </EditPage>
  );
}
