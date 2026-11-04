import { Suspense } from "react";
import type { Metadata } from "next";
import { ADMIN_ONLY } from "@/lib/access";
import { requireRole } from "@/server/session";
import { listCategories } from "@/server/services/master-data";
import { CategoryIcon } from "@/components/category-icon";
import { ButtonLink } from "@/components/button-link";
import { Badge } from "@/components/ui/badge";
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
import { CategoryForm, DeleteButton } from "../master-data-forms";
import { SavedNotice } from "../saved-notice";

export const metadata: Metadata = { title: "Categories" };

export default function CategoriesPage({ searchParams }: PageProps<"/manage/categories">) {
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-6 px-4 py-10">
      <AdminHeader
        current="/manage/categories"
        title="Categories"
        description="Groups of events shown on the home page, in this order."
      />
      <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
        <CategoriesContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function CategoriesContent({
  searchParams,
}: Pick<PageProps<"/manage/categories">, "searchParams">) {
  await requireRole(ADMIN_ONLY, "/manage/categories");
  const { saved, deleted } = await searchParams;
  const categories = await listCategories();

  return (
    <>
      {(saved || deleted) && <SavedNotice text={deleted ? "Deleted." : "Saved."} />}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <span className="sr-only">Icon</span>
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Web address</TableHead>
                <TableHead className="text-right">Events</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No categories yet. Add the first one.
                  </TableCell>
                </TableRow>
              )}
              {categories.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <CategoryIcon name={c.icon} className="size-4" />
                  </TableCell>
                  <TableCell className="font-medium">
                    {c.name}{" "}
                    {!c.isActive && (
                      <Badge variant="outline" className="ml-1">
                        Hidden
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {c.slug}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{c._count.events}</TableCell>
                  <TableCell className="text-right">
                    <ButtonLink href={`/manage/categories/${c.id}`} variant="ghost" size="sm">
                      Edit
                    </ButtonLink>
                    <DeleteButton kind="category" id={c.id} name={c.name} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Add category</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryForm />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
