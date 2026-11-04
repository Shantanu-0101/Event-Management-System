import { Suspense } from "react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { SearchIcon } from "lucide-react";
import type { Role } from "@/generated/prisma/enums";
import { ADMIN_ONLY } from "@/lib/access";
import { roleSchema } from "@/lib/schemas";
import { yearLabel } from "@/lib/years";
import { requireRole } from "@/server/session";
import { listUsers } from "@/server/services/users";
import { NativeSelect } from "@/components/form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/button-link";
import { Input } from "@/components/ui/input";
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
import { ActiveToggle, RoleSelect } from "./user-actions";

export const metadata: Metadata = { title: "Users" };

export default function UsersPage({ searchParams }: PageProps<"/manage/users">) {
  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10">
      <AdminHeader
        current="/manage/users"
        title="Users"
        description="Search accounts, change roles and deactivate accounts. Changes sign the user out."
      />
      <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
        <UsersContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function UsersContent({ searchParams }: Pick<PageProps<"/manage/users">, "searchParams">) {
  const me = await requireRole(ADMIN_ONLY, "/manage/users");
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.slice(0, 100) : "";
  const roleParsed = roleSchema.safeParse(params.role);
  const role: Role | undefined = roleParsed.success ? roleParsed.data : undefined;
  const page = Math.max(1, Number(params.page) || 1);

  const { users, total, pages } = await listUsers({ q, role, page });

  const pageHref = (p: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (role) sp.set("role", role);
    if (p > 1) sp.set("page", String(p));
    const s = sp.toString();
    return s ? `/manage/users?${s}` : "/manage/users";
  };

  return (
    <>
      <Form action="/manage/users" className="flex flex-wrap items-end gap-2" role="search">
        <div className="relative min-w-56 flex-1">
          <SearchIcon className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Name, email or roll number"
            aria-label="Search users"
            className="pl-8"
          />
        </div>
        <NativeSelect
          name="role"
          defaultValue={role ?? ""}
          aria-label="Filter by role"
          className="w-40"
        >
          <option value="">All roles</option>
          <option value="STUDENT">Students</option>
          <option value="COORDINATOR">Coordinators</option>
          <option value="ADMIN">Admins</option>
        </NativeSelect>
        <Button type="submit" variant="secondary">
          Search
        </Button>
        {(q || role) && (
          <ButtonLink href="/manage/users" variant="ghost">
            Clear
          </ButtonLink>
        )}
      </Form>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {total === 0 ? "No users match." : `${total} user${total === 1 ? "" : "s"}`}
      </p>

      {users.length > 0 && (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Roll no</TableHead>
                <TableHead className="hidden lg:table-cell">Department · year</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Account</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => {
                const self = u.id === me.id;
                return (
                  <TableRow key={u.id} className={u.isActive ? undefined : "opacity-60"}>
                    <TableCell className="max-w-64">
                      <div className="truncate font-medium">
                        {u.name}
                        {self && <span className="text-muted-foreground"> (you)</span>}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {u.email}
                        {!u.emailVerifiedAt && " · not verified"}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{u.rollNo ?? "—"}</TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {u.department?.code ?? "—"} · {yearLabel(u.year)}
                    </TableCell>
                    <TableCell>
                      <RoleSelect userId={u.id} role={u.role} disabled={self} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {!u.isActive && <Badge variant="outline">Deactivated</Badge>}
                        {!self && (
                          <ActiveToggle userId={u.id} name={u.name} isActive={u.isActive} />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {page} of {pages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <ButtonLink href={pageHref(page - 1)} variant="outline" size="sm">
                Previous
              </ButtonLink>
            )}
            {page < pages && (
              <ButtonLink href={pageHref(page + 1)} variant="outline" size="sm">
                Next
              </ButtonLink>
            )}
          </div>
        </nav>
      )}
      <p className="text-xs text-muted-foreground">
        Staff accounts are created by signing up and then given a role here.{" "}
        <Link href="/manage/departments" className="underline underline-offset-4">
          Manage departments
        </Link>
      </p>
    </>
  );
}
