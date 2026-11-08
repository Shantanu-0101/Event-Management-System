import { Suspense } from "react";
import type { Metadata } from "next";
import Form from "next/form";
import { forbidden, notFound } from "next/navigation";
import { ChevronLeftIcon, DownloadIcon, ScanLineIcon } from "lucide-react";
import { STAFF_ROLES } from "@/lib/access";
import { seatsLeft, teamSharesSeat } from "@/lib/events";
import { prisma } from "@/lib/prisma";
import {
  ATTENDANCE_FILTERS,
  ATTENDANCE_FILTER_LABELS,
  filterQuery,
  parseRegistrationFilters,
  REGISTRATION_STATUS_LABELS,
  STATUS_FILTERS,
  STATUS_FILTER_LABELS,
  type RegistrationRow,
} from "@/lib/registration-list";
import { formatDateTime } from "@/lib/time";
import { YEARS } from "@/lib/years";
import { canManageEvent, getEventForEdit } from "@/server/services/events";
import { getRegistrationSummary, listRegistrations } from "@/server/services/registration-list";
import { requireRole } from "@/server/session";
import { ButtonLink } from "@/components/button-link";
import { NativeSelect } from "@/components/form";
import { Pagination } from "@/components/pagination";
import { StatTile } from "@/components/stat-tile";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
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

export const metadata: Metadata = { title: "Registrations" };

type Props = PageProps<"/manage/events/[id]/registrations">;

export default function RegistrationsPage({ params, searchParams }: Props) {
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-6 px-4 py-10">
      <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
        <RegistrationsContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function RegistrationsContent({ params, searchParams }: Props) {
  const { id } = await params;
  const path = `/manage/events/${id}/registrations`;
  const me = await requireRole(STAFF_ROLES, path);
  const event = await getEventForEdit(id);
  if (!event) notFound();
  if (!canManageEvent(me, event)) forbidden();

  const query = await searchParams;
  const filters = parseRegistrationFilters(query);
  const requestedPage = Math.floor(Number(query.page)) || 1;

  const [{ rows, total, pages, page }, summary, departments, seatTeams] = await Promise.all([
    listRegistrations(id, filters, requestedPage),
    getRegistrationSummary(id),
    prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, code: true } }),
    teamSharesSeat(event)
      ? prisma.team.count({
          where: { eventId: id, registrations: { some: { status: "CONFIRMED" } } },
        })
      : null,
  ]);

  const queryString = filterQuery(filters).toString();
  const left = seatsLeft(event.capacity, seatTeams ?? summary.registered);
  const pageHref = (p: number) => {
    const next = filterQuery(filters);
    if (p > 1) next.set("page", String(p));
    const s = next.toString();
    return s ? `${path}?${s}` : path;
  };
  const exportHref = (format: string) => {
    const next = filterQuery(filters);
    next.set("format", format);
    return `/api/v1/events/${id}/registrations?${next}`;
  };

  return (
    <>
      <div className="grid gap-2">
        <ButtonLink href={`/manage/events/${id}`} variant="ghost" size="sm" className="w-fit">
          <ChevronLeftIcon data-icon="inline-start" /> Event
        </ButtonLink>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold break-words">{event.title}</h1>
            <p className="text-sm text-muted-foreground">Registrations and attendance</p>
          </div>
          <ButtonLink href={`/manage/check-in/${id}`}>
            <ScanLineIcon data-icon="inline-start" /> Check-in
          </ButtonLink>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Registered" value={summary.registered} />
        <StatTile label="Checked in" value={summary.checkedIn} />
        <StatTile label="On the waitlist" value={summary.waitlisted} />
        <StatTile label="Seats left" value={left ?? "No limit"} />
      </dl>

      <Form action={path} className="flex flex-wrap gap-2" role="search">
        <Input
          name="q"
          defaultValue={filters.q}
          placeholder="Name, roll no, email or team"
          aria-label="Search registrations"
          className="min-w-52 flex-1"
        />
        <NativeSelect
          key={`status-${filters.status}`}
          name="status"
          defaultValue={filters.status}
          aria-label="Filter by status"
          className="w-52"
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>
              {STATUS_FILTER_LABELS[s]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          key={`attendance-${filters.attendance}`}
          name="attendance"
          defaultValue={filters.attendance}
          aria-label="Filter by attendance"
          className="w-40"
        >
          {ATTENDANCE_FILTERS.map((a) => (
            <option key={a} value={a}>
              {ATTENDANCE_FILTER_LABELS[a]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          key={`department-${filters.department}`}
          name="department"
          defaultValue={filters.department}
          aria-label="Filter by department"
          className="w-40"
        >
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.code}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          key={`year-${filters.year ?? ""}`}
          name="year"
          defaultValue={filters.year ? String(filters.year) : ""}
          aria-label="Filter by year"
          className="w-28"
        >
          <option value="">All years</option>
          {YEARS.map((y) => (
            <option key={y.value} value={y.value}>
              {y.label}
            </option>
          ))}
        </NativeSelect>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        {queryString && (
          <ButtonLink href={path} variant="ghost">
            Clear
          </ButtonLink>
        )}
      </Form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {total === 1 ? "1 person" : `${total} people`}
        </p>
        {total > 0 && (
          // Plain links, not <Link>: prefetching one would write a false export to the audit log.
          <div className="flex flex-wrap gap-2">
            <a
              href={exportHref("csv")}
              download
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <DownloadIcon data-icon="inline-start" /> CSV
            </a>
            <a
              href={exportHref("xlsx")}
              download
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <DownloadIcon data-icon="inline-start" /> Excel
            </a>
          </div>
        )}
      </div>

      {total === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          {queryString ? "Nobody matches these filters." : "Nobody has registered yet."}
        </p>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead className="hidden md:table-cell">Department</TableHead>
                <TableHead className="hidden lg:table-cell">Contact</TableHead>
                <TableHead className="hidden sm:table-cell">Team</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Checked in</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <RegistrationTableRow key={row.id} row={row} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Pagination page={page} pages={pages} href={pageHref} />
    </>
  );
}

function RegistrationTableRow({ row }: { row: RegistrationRow }) {
  return (
    <TableRow>
      <TableCell className="max-w-44 whitespace-normal sm:max-w-64">
        <div className="font-medium break-words">{row.name}</div>
        {row.rollNo && <div className="text-xs text-muted-foreground">{row.rollNo}</div>}
        {/* On a phone the columns hidden further along are folded in here. */}
        <div className="mt-1 grid gap-0.5 text-xs text-muted-foreground lg:hidden">
          <span className="break-all">{row.email}</span>
          {row.phone && <span>{row.phone}</span>}
          {row.team && <span className="break-words sm:hidden">Team {row.team}</span>}
        </div>
      </TableCell>
      <TableCell className="hidden md:table-cell">
        {row.department ?? "—"}
        {row.year && ` · Year ${row.year}`}
      </TableCell>
      <TableCell className="hidden whitespace-normal lg:table-cell">
        <div className="break-all">{row.email}</div>
        {row.phone && <div className="text-xs text-muted-foreground">{row.phone}</div>}
      </TableCell>
      <TableCell className="hidden max-w-40 break-words whitespace-normal sm:table-cell">
        {row.team ?? "—"}
      </TableCell>
      <TableCell className="whitespace-normal">
        <StatusBadge row={row} />
        {row.checkedInAt && (
          <div className="mt-1 text-xs text-muted-foreground sm:hidden">
            In: {formatDateTime(row.checkedInAt)}
          </div>
        )}
      </TableCell>
      <TableCell className="hidden whitespace-normal sm:table-cell">
        {row.checkedInAt ? (
          <>
            <div>{formatDateTime(row.checkedInAt)}</div>
            {row.checkedInBy && (
              <div className="text-xs text-muted-foreground">by {row.checkedInBy}</div>
            )}
          </>
        ) : (
          "—"
        )}
      </TableCell>
    </TableRow>
  );
}

function StatusBadge({ row }: { row: RegistrationRow }) {
  if (row.status === "WAITLISTED") {
    return <Badge variant="secondary">Waitlist #{row.waitlistPlace}</Badge>;
  }
  if (row.status === "CANCELLED") {
    return <Badge variant="outline">{REGISTRATION_STATUS_LABELS.CANCELLED}</Badge>;
  }
  return <Badge>{row.checkedInAt ? "Checked in" : REGISTRATION_STATUS_LABELS.CONFIRMED}</Badge>;
}
