import { Suspense } from "react";
import type { Metadata } from "next";
import { ADMIN_ONLY } from "@/lib/access";
import { requireRole } from "@/server/session";
import { listDepartments } from "@/server/services/master-data";
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
import { DeleteButton, DepartmentForm } from "../master-data-forms";
import { SavedNotice } from "../saved-notice";

export const metadata: Metadata = { title: "Departments" };

export default function DepartmentsPage({ searchParams }: PageProps<"/manage/departments">) {
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-6 px-4 py-10">
      <AdminHeader
        current="/manage/departments"
        title="Departments"
        description="Students pick one at sign-up; events can be limited to some of them."
      />
      <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
        <DepartmentsContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function DepartmentsContent({
  searchParams,
}: Pick<PageProps<"/manage/departments">, "searchParams">) {
  await requireRole(ADMIN_ONLY, "/manage/departments");
  const { saved, deleted } = await searchParams;
  const departments = await listDepartments();

  return (
    <>
      {(saved || deleted) && <SavedNotice text={deleted ? "Deleted." : "Saved."} />}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead className="text-right">Users</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {departments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No departments yet. Add the first one.
                  </TableCell>
                </TableRow>
              )}
              {departments.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium whitespace-normal">{d.name}</TableCell>
                  <TableCell>{d.code}</TableCell>
                  <TableCell className="text-right tabular-nums">{d._count.users}</TableCell>
                  <TableCell className="text-right">
                    <ButtonLink href={`/manage/departments/${d.id}`} variant="ghost" size="sm">
                      Edit
                    </ButtonLink>
                    <DeleteButton kind="department" id={d.id} name={d.name} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Add department</CardTitle>
          </CardHeader>
          <CardContent>
            <DepartmentForm />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
