import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ADMIN_ONLY } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/server/session";
import { Skeleton } from "@/components/ui/skeleton";
import { EditPage } from "../../edit-page";
import { DepartmentForm } from "../../master-data-forms";

export const metadata: Metadata = { title: "Edit department" };

export default function EditDepartmentPage({ params }: PageProps<"/manage/departments/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto mt-10 h-96 max-w-2xl rounded-xl" />}>
      <EditContent params={params} />
    </Suspense>
  );
}

async function EditContent({ params }: Pick<PageProps<"/manage/departments/[id]">, "params">) {
  const { id } = await params;
  await requireRole(ADMIN_ONLY, `/manage/departments/${id}`);
  const department = await prisma.department.findUnique({ where: { id } });
  if (!department) notFound();

  return (
    <EditPage
      backHref="/manage/departments"
      backLabel="Departments"
      title={`Edit ${department.name}`}
    >
      <DepartmentForm department={department} />
    </EditPage>
  );
}
