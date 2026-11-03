import { Suspense } from "react";
import type { Metadata } from "next";
import { ADMIN_ONLY } from "@/lib/access";
import { requireRole } from "@/server/session";
import { listVenues } from "@/server/services/master-data";
import { ButtonLink } from "@/components/button-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminHeader } from "../admin-tabs";
import { DeleteButton, VenueForm } from "../master-data-forms";
import { SavedNotice } from "../saved-notice";

export const metadata: Metadata = { title: "Venues" };

export default function VenuesPage({ searchParams }: PageProps<"/manage/venues">) {
  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10">
      <AdminHeader
        current="/manage/venues"
        title="Venues"
        description="Halls, labs and grounds that events can be held in."
      />
      <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
        <VenuesContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function VenuesContent({ searchParams }: Pick<PageProps<"/manage/venues">, "searchParams">) {
  await requireRole(ADMIN_ONLY, "/manage/venues");
  const { saved, deleted } = await searchParams;
  const venues = await listVenues();

  return (
    <>
      {(saved || deleted) && <SavedNotice text={deleted ? "Deleted." : "Saved."} />}

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Building</TableHead>
                <TableHead className="text-right">Seats</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {venues.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No venues yet. Add the first one.
                  </TableCell>
                </TableRow>
              )}
              {venues.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-medium">{v.name}</TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {v.building ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{v.capacity ?? "Open"}</TableCell>
                  <TableCell className="text-right">
                    <ButtonLink href={`/manage/venues/${v.id}`} variant="ghost" size="sm">
                      Edit
                    </ButtonLink>
                    <DeleteButton kind="venue" id={v.id} name={v.name} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Add venue</CardTitle>
          </CardHeader>
          <CardContent>
            <VenueForm />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
