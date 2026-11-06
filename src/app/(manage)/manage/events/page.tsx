import { Suspense } from "react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { PlusIcon, SearchIcon } from "lucide-react";
import { z } from "zod";
import { STAFF_ROLES } from "@/lib/access";
import { effectiveStatus, seatsLeft, seatsTaken, STATUS_LABELS } from "@/lib/events";
import { formatDateTime } from "@/lib/time";
import { requireRole } from "@/server/session";
import { listManagedEvents } from "@/server/services/events";
import { ButtonLink } from "@/components/button-link";
import { EventStatusBadge } from "@/components/event-status-badge";
import { NativeSelect } from "@/components/form";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdminHeader } from "../admin-tabs";
import { DuplicateEventButton } from "./event-actions";

export const metadata: Metadata = { title: "Manage events" };

const statusSchema = z.enum([
  "DRAFT",
  "PUBLISHED",
  "REG_CLOSED",
  "ONGOING",
  "COMPLETED",
  "CANCELLED",
]);

export default function ManageEventsPage({ searchParams }: PageProps<"/manage/events">) {
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-6 px-4 py-10">
      <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
        <ManageEventsContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ManageEventsContent({
  searchParams,
}: Pick<PageProps<"/manage/events">, "searchParams">) {
  const me = await requireRole(STAFF_ROLES, "/manage/events");
  const isAdmin = me.role === "ADMIN";
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const parsedStatus = statusSchema.safeParse(params.status);
  const status = parsedStatus.success ? parsedStatus.data : undefined;
  const requestedPage = Math.max(1, Math.floor(Number(params.page)) || 1);

  const now = new Date();
  const { events, total, pages, page } = await listManagedEvents(
    me,
    { q, status, page: requestedPage },
    now,
  );

  const pageHref = (p: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (status) sp.set("status", status);
    if (p > 1) sp.set("page", String(p));
    const s = sp.toString();
    return s ? `/manage/events?${s}` : "/manage/events";
  };

  return (
    <>
      {isAdmin ? (
        <AdminHeader
          current="/manage/events"
          title="Events"
          description="Create events, publish them and assign coordinators."
        />
      ) : (
        <div>
          <h1 className="text-2xl font-semibold">My events to run</h1>
          <p className="text-sm text-muted-foreground">The events you are a coordinator of.</p>
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <Form action="/manage/events" className="flex flex-1 flex-wrap gap-2" role="search">
          <div className="relative min-w-52 flex-1">
            <SearchIcon className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground" />
            <Input
              name="q"
              defaultValue={q}
              placeholder="Search by title"
              aria-label="Search events"
              className="pl-8"
            />
          </div>
          <NativeSelect
            key={status ?? ""}
            name="status"
            defaultValue={status ?? ""}
            aria-label="Filter by status"
            className="w-44"
          >
            <option value="">All statuses</option>
            {statusSchema.options.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
          <Button type="submit" variant="secondary">
            Search
          </Button>
          {(q || status) && (
            <ButtonLink href="/manage/events" variant="ghost">
              Clear
            </ButtonLink>
          )}
        </Form>
        {isAdmin && (
          <ButtonLink href="/manage/events/new">
            <PlusIcon data-icon="inline-start" /> New event
          </ButtonLink>
        )}
      </div>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {total === 0
          ? emptyText(isAdmin, Boolean(q || status))
          : `${total} event${total === 1 ? "" : "s"}`}
      </p>

      {events.length > 0 && (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead className="hidden md:table-cell">Starts</TableHead>
                <TableHead className="hidden sm:table-cell">Status</TableHead>
                <TableHead className="hidden text-right lg:table-cell">Seats left</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((e) => {
                const shown = effectiveStatus(e, now);
                const left = seatsLeft(e.capacity, seatsTaken(e));
                return (
                  <TableRow key={e.id}>
                    <TableCell className="max-w-44 whitespace-normal sm:max-w-80">
                      <Link
                        href={`/manage/events/${e.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {e.title}
                      </Link>
                      <div className="text-xs text-muted-foreground">{e.category.name}</div>
                      <div className="mt-1 sm:hidden">
                        <EventStatusBadge status={shown} />
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {formatDateTime(e.startsAt)}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <EventStatusBadge status={shown} />
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums lg:table-cell">
                      {left ?? "No limit"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end gap-1 sm:flex-row sm:justify-end">
                        <ButtonLink
                          href={`/manage/events/${e.id}/registrations`}
                          variant="ghost"
                          size="sm"
                        >
                          Registrations
                        </ButtonLink>
                        <ButtonLink href={`/manage/events/${e.id}`} variant="ghost" size="sm">
                          Edit
                        </ButtonLink>
                        {isAdmin && <DuplicateEventButton eventId={e.id} />}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Pagination page={page} pages={pages} href={pageHref} />
    </>
  );
}

function emptyText(isAdmin: boolean, filtered: boolean) {
  if (filtered) return "No events match.";
  return isAdmin
    ? "No events yet. Create the first one."
    : "No events yet. An admin assigns you to events.";
}
