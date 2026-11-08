import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ADMIN_ONLY } from "@/lib/access";
import { percent } from "@/lib/check-in";
import { getCollegeReport } from "@/server/services/reports";
import { requireRole } from "@/server/session";
import { BarList } from "@/components/bar-list";
import { StatTile } from "@/components/stat-tile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage() {
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-6 px-4 py-10">
      <AdminHeader
        current="/manage/reports"
        title="Reports"
        description="Registrations and attendance across the college."
      />
      <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
        <ReportsContent />
      </Suspense>
    </div>
  );
}

async function ReportsContent() {
  await requireRole(ADMIN_ONLY, "/manage/reports");
  const report = await getCollegeReport(new Date());
  const { attendance } = report;
  const rate = percent(attendance.checkedIn, attendance.registered);

  const countBars = (rows: { label: string; registered: number }[]) =>
    rows.map((r) => ({ label: r.label, value: r.registered, display: String(r.registered) }));
  const largest = (rows: { registered: number }[]) => Math.max(1, ...rows.map((r) => r.registered));

  return (
    <>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Events" value={report.events} note={`${report.upcoming} not over yet`} />
        <StatTile label="Registrations" value={report.registrations} note="Confirmed places" />
        <StatTile label="Students" value={report.students} note="Active accounts" />
        <StatTile
          label="Attendance rate"
          value={rate === null ? "—" : `${rate}%`}
          note={
            rate === null
              ? "No finished event has taken attendance yet"
              : `${attendance.checkedIn} of ${attendance.registered}, over ${attendance.eventCount} finished ${attendance.eventCount === 1 ? "event" : "events"}`
          }
        />
      </dl>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
        <ChartCard title="Registrations by category" description="Confirmed registrations">
          {report.byCategory.length === 0 ? (
            <Empty />
          ) : (
            <BarList
              title="Registrations by category"
              bars={countBars(report.byCategory)}
              max={largest(report.byCategory)}
            />
          )}
        </ChartCard>

        <ChartCard title="Registrations by department" description="The student's department">
          {report.byDepartment.length === 0 ? (
            <Empty />
          ) : (
            <BarList
              title="Registrations by department"
              bars={countBars(report.byDepartment)}
              max={largest(report.byDepartment)}
            />
          )}
        </ChartCard>

        <ChartCard
          title="Attendance by event"
          description="Latest finished events that took attendance"
        >
          {attendance.recent.length === 0 ? (
            <Empty text="Nothing yet. This fills in once an event has finished and people were checked in." />
          ) : (
            <BarList
              title="Attendance by event"
              max={100}
              bars={attendance.recent.map((e) => {
                const share = percent(e.checkedIn, e.registered) ?? 0;
                return {
                  label: e.title,
                  value: share,
                  display: `${share}% · ${e.checkedIn} of ${e.registered}`,
                };
              })}
            />
          )}
        </ChartCard>

        <ChartCard title="Top events" description="Most confirmed registrations">
          {report.topEvents.length === 0 ? (
            <Empty />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead className="text-right">Registered</TableHead>
                  <TableHead className="text-right">Checked in</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.topEvents.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="max-w-40 whitespace-normal sm:max-w-64">
                      <Link
                        href={`/manage/events/${e.id}/registrations`}
                        className="font-medium break-words underline-offset-4 hover:underline"
                      >
                        {e.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{e.registered}</TableCell>
                    <TableCell className="text-right tabular-nums">{e.checkedIn}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </ChartCard>
      </div>
    </>
  );
}

function ChartCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Empty({ text = "No registrations yet." }: { text?: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}
