"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ADMIN_ONLY } from "@/lib/access";
import { failed, invalid, type FormState } from "@/lib/form-state";
import { prisma } from "@/lib/prisma";
import { categorySchema, departmentSchema, roleSchema, slugify, venueSchema } from "@/lib/schemas";
import { requireRole } from "@/server/session";
import {
  deleteCategory,
  deleteDepartment,
  deleteVenue,
  MasterDataError,
  uniqueClash,
} from "@/server/services/master-data";
import { changeRole, setActive, UserRuleError } from "@/server/services/users";

// Admin-only actions. Every one checks the role itself: a server action is a
// public HTTP endpoint, whatever page its form sits on.

const admin = () => requireRole(ADMIN_ONLY);

// ─── Users ──────────────────────────────────────────────────────────────────

export async function changeRoleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await admin();
  const userId = String(formData.get("userId") ?? "");
  const role = roleSchema.safeParse(formData.get("role"));
  if (!userId || !role.success) return failed("Choose a role.");

  try {
    await changeRole(me.id, userId, role.data);
  } catch (e) {
    if (e instanceof UserRuleError) return failed(e.message);
    throw e;
  }
  revalidatePath("/manage/users");
  return { ok: true, message: "Role changed. They will need to log in again." };
}

export async function setActiveAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await admin();
  const userId = String(formData.get("userId") ?? "");
  const isActive = formData.get("isActive") === "true";

  try {
    await setActive(me.id, userId, isActive);
  } catch (e) {
    if (e instanceof UserRuleError) return failed(e.message);
    throw e;
  }
  revalidatePath("/manage/users");
  return { ok: true, message: isActive ? "Account reactivated." : "Account deactivated." };
}

// ─── Master data ────────────────────────────────────────────────────────────

/** Runs a create/update, turning rule and unique errors into form messages. */
async function save(
  formData: FormData,
  labels: Record<string, string>,
  write: () => Promise<unknown>,
  paths: string[],
  done: string,
): Promise<FormState> {
  try {
    await write();
  } catch (e) {
    const clash = uniqueClash(e, labels);
    if (clash) return failed(clash.message, formData, clash.field);
    if (e instanceof MasterDataError) return failed(e.message, formData, e.field);
    throw e;
  }
  for (const p of paths) revalidatePath(p);
  redirect(done);
}

// The deleted row's own component unmounts, so it can't show a toast; the
// list page shows "Deleted." from the query string instead.
async function remove(
  remover: () => Promise<void>,
  paths: string[],
  done: string,
): Promise<FormState> {
  try {
    await remover();
  } catch (e) {
    if (e instanceof MasterDataError) return failed(e.message);
    throw e;
  }
  for (const p of paths) revalidatePath(p);
  redirect(done);
}

export async function saveDepartmentAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await admin();
  const id = formData.get("id")?.toString();
  const parsed = departmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);

  return save(
    formData,
    { code: "code", name: "name" },
    () =>
      id
        ? prisma.department.update({ where: { id }, data: parsed.data })
        : prisma.department.create({ data: parsed.data }),
    ["/manage/departments", "/signup"],
    "/manage/departments?saved=1",
  );
}

export async function deleteDepartmentAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await admin();
  return remove(
    () => deleteDepartment(String(formData.get("id"))),
    ["/manage/departments"],
    "/manage/departments?deleted=1",
  );
}

export async function saveCategoryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await admin();
  const id = formData.get("id")?.toString();
  const parsed = categorySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);

  const data = {
    ...parsed.data,
    slug: parsed.data.slug ?? slugify(parsed.data.name),
    description: parsed.data.description ?? null,
    icon: parsed.data.icon ?? null,
  };
  return save(
    formData,
    { slug: "web address", name: "name" },
    () => (id ? prisma.category.update({ where: { id }, data }) : prisma.category.create({ data })),
    ["/manage/categories", "/"],
    "/manage/categories?saved=1",
  );
}

export async function deleteCategoryAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await admin();
  return remove(
    () => deleteCategory(String(formData.get("id"))),
    ["/manage/categories", "/"],
    "/manage/categories?deleted=1",
  );
}

export async function saveVenueAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await admin();
  const id = formData.get("id")?.toString();
  const parsed = venueSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);

  const data = {
    name: parsed.data.name,
    building: parsed.data.building ?? null,
    capacity: parsed.data.capacity ?? null,
  };
  return save(
    formData,
    { name: "name" },
    () => (id ? prisma.venue.update({ where: { id }, data }) : prisma.venue.create({ data })),
    ["/manage/venues"],
    "/manage/venues?saved=1",
  );
}

export async function deleteVenueAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await admin();
  return remove(
    () => deleteVenue(String(formData.get("id"))),
    ["/manage/venues"],
    "/manage/venues?deleted=1",
  );
}
