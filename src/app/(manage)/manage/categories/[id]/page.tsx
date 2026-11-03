import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ADMIN_ONLY } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/server/session";
import { Skeleton } from "@/components/ui/skeleton";
import { EditPage } from "../../edit-page";
import { CategoryForm } from "../../master-data-forms";

export const metadata: Metadata = { title: "Edit category" };

export default function EditCategoryPage({ params }: PageProps<"/manage/categories/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto mt-10 h-96 max-w-2xl rounded-xl" />}>
      <EditContent params={params} />
    </Suspense>
  );
}

async function EditContent({ params }: Pick<PageProps<"/manage/categories/[id]">, "params">) {
  const { id } = await params;
  await requireRole(ADMIN_ONLY, `/manage/categories/${id}`);
  const category = await prisma.category.findUnique({ where: { id } });
  if (!category) notFound();

  return (
    <EditPage backHref="/manage/categories" backLabel="Categories" title={`Edit ${category.name}`}>
      <CategoryForm category={category} />
    </EditPage>
  );
}
