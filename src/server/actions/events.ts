"use server";

import { revalidatePath } from "next/cache";
import { forbidden, redirect } from "next/navigation";
import { after } from "next/server";
import { ADMIN_ONLY, STAFF_ROLES } from "@/lib/access";
import { sendEmails } from "@/lib/email";
import { eventFormValues, eventSchema } from "@/lib/event-schema";
import type { StatusAction } from "@/lib/events";
import { failed, invalid, type FormState } from "@/lib/form-state";
import { saveImage, savePdf, UploadError } from "@/lib/storage";
import { requireRole } from "@/server/session";
import {
  changeEventStatus,
  createEvent,
  duplicateEvent,
  EventRuleError,
  updateEvent,
} from "@/server/services/events";

// Every action checks the role itself: a server action is a public HTTP
// endpoint, whatever page its form sits on. Which event a coordinator may touch
// is checked by the service.

function refreshEventPages() {
  revalidatePath("/manage/events");
  revalidatePath("/events");
  revalidatePath("/");
}

export async function saveEventAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireRole(STAFF_ROLES);
  const id = formData.get("id")?.toString();
  // Coordinators can only edit events they were assigned to, not create them.
  if (!id && me.role !== "ADMIN") forbidden();

  const parsed = eventSchema.safeParse(eventFormValues(formData));
  if (!parsed.success) return invalid(parsed.error, formData);

  let savedId = id;
  try {
    if (id) {
      const emails = await updateEvent(me, id, parsed.data, new Date());
      if (emails.length > 0) after(() => sendEmails(emails));
    } else {
      savedId = (await createEvent(me, parsed.data)).id;
    }
  } catch (e) {
    if (e instanceof EventRuleError) return failed(e.message, formData, e.field);
    throw e;
  }

  refreshEventPages();
  redirect(`/manage/events/${savedId}?saved=1`);
}

export async function duplicateEventAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const me = await requireRole(ADMIN_ONLY);

  let copyId: string;
  try {
    copyId = (await duplicateEvent(me, String(formData.get("id")))).id;
  } catch (e) {
    if (e instanceof EventRuleError) return failed(e.message);
    throw e;
  }

  revalidatePath("/manage/events");
  redirect(`/manage/events/${copyId}?saved=copy`);
}

const ACTIONS: readonly StatusAction[] = ["publish", "close", "reopen", "cancel"];

export async function changeEventStatusAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const me = await requireRole(STAFF_ROLES);
  const id = String(formData.get("id"));
  const action = formData.get("action") as StatusAction;
  if (!ACTIONS.includes(action)) return failed("Choose a status change.");

  try {
    const emails = await changeEventStatus(me, id, action, new Date());
    if (emails.length > 0) after(() => sendEmails(emails));
  } catch (e) {
    if (e instanceof EventRuleError) return failed(e.message);
    throw e;
  }

  refreshEventPages();
  redirect(`/manage/events/${id}?saved=${action}`);
}

/**
 * Uploads a poster or rules PDF as soon as it's picked, and returns its link
 * for the form. Sending files on their own means a form error can't lose them
 * and the save stays within Vercel's 4.5 MB limit per request.
 */
export async function uploadEventFileAction(
  formData: FormData,
): Promise<{ url: string } | { error: string }> {
  await requireRole(STAFF_ROLES);
  const kind = formData.get("kind");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file." };

  try {
    const url =
      kind === "rules"
        ? await savePdf(file, "event-rules")
        : await saveImage(file, "event-posters");
    return { url };
  } catch (e) {
    if (e instanceof UploadError) return { error: e.message };
    throw e;
  }
}
