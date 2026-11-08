"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { ADMIN_ONLY, STAFF_ROLES } from "@/lib/access";
import { assertUsableTemplate } from "@/lib/certificate-pdf";
import { PLACES } from "@/lib/certificates";
import { failed, invalid, type FormState } from "@/lib/form-state";
import { tryAgainMessage } from "@/lib/rate-limits";
import { announcementSchema, feedbackSchema } from "@/lib/schemas";
import { saveImage, savePdf, UploadError } from "@/lib/storage";
import { sendAnnouncement } from "@/server/services/announcements";
import { generateCertificates, setCertificateTemplate } from "@/server/services/certificates";
import { EventRuleError } from "@/server/services/events";
import { submitFeedback } from "@/server/services/feedback";
import { deliver } from "@/server/services/notifications";
import { hitRateLimit } from "@/server/services/rate-limit";
import { saveResults } from "@/server/services/results";
import { requireRole, requireUser } from "@/server/session";

// Every action checks the role itself; which event a coordinator may touch is
// checked by the service.

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "");

function refreshAfterEventPages(eventId: string) {
  revalidatePath(`/manage/events/${eventId}/results`);
  revalidatePath("/my-events");
  revalidatePath("/events/[slug]", "page");
}

/** Runs a change, turning a broken rule into a message for the form. */
async function attempt(formData: FormData, change: () => Promise<string>): Promise<FormState> {
  try {
    return { ok: true, message: await change() };
  } catch (e) {
    if (e instanceof EventRuleError) return failed(e.message, formData, e.field);
    throw e;
  }
}

export async function saveResultsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireRole(STAFF_ROLES);
  const eventId = text(formData, "eventId");
  const picks = PLACES.map((place) => text(formData, `place${place}`) || null);

  return attempt(formData, async () => {
    const { emails } = await saveResults(me, eventId, picks, new Date());
    after(() => deliver(emails));
    refreshAfterEventPages(eventId);
    return "Results saved.";
  });
}

export async function generateCertificatesAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const me = await requireRole(STAFF_ROLES);
  const eventId = text(formData, "eventId");

  return attempt(formData, async () => {
    const { issued, emails } = await generateCertificates(me, eventId, new Date());
    after(() => deliver(emails));
    refreshAfterEventPages(eventId);
    if (issued === 0) return "Everyone already has their certificates.";
    return issued === 1 ? "1 certificate issued." : `${issued} certificates issued.`;
  });
}

const TEMPLATE_TYPES = ["image/png", "image/jpeg", "application/pdf"];

export async function uploadCertificateTemplateAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const me = await requireRole(ADMIN_ONLY);
  const eventId = text(formData, "eventId");
  const file = formData.get("template");
  if (!(file instanceof File) || file.size === 0) return failed("Choose a file.");
  if (!TEMPLATE_TYPES.includes(file.type)) return failed("Use a PNG, JPG or PDF file.");

  const limit = await hitRateLimit("uploadUser", me.id);
  if (!limit.ok) return failed(tryAgainMessage(limit.retryAfterSeconds));

  try {
    await assertUsableTemplate(new Uint8Array(await file.arrayBuffer()));
  } catch {
    return failed("That file can't be used. PDFs must not be password-protected.");
  }

  try {
    const url =
      file.type === "application/pdf"
        ? await savePdf(file, "certificate-templates")
        : await saveImage(file, "certificate-templates");
    await setCertificateTemplate(me, eventId, url);
  } catch (e) {
    if (e instanceof UploadError) return failed(e.message);
    throw e;
  }
  refreshAfterEventPages(eventId);
  return { ok: true, message: "Template saved. Check it with a sample below." };
}

export async function removeCertificateTemplateAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const me = await requireRole(ADMIN_ONLY);
  const eventId = text(formData, "eventId");
  await setCertificateTemplate(me, eventId, null);
  refreshAfterEventPages(eventId);
  return { ok: true, message: "Template removed. Certificates use the built-in design." };
}

export async function submitFeedbackAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  // Having attended is what counts, and the service checks it. Someone made a
  // coordinator since the event can still rate it.
  const me = await requireUser();
  const parsed = feedbackSchema.safeParse({
    rating: formData.get("rating"),
    comment: formData.get("comment"),
  });
  if (!parsed.success) return invalid(parsed.error, formData);

  const eventId = text(formData, "eventId");
  return attempt(formData, async () => {
    await submitFeedback(me.id, eventId, parsed.data, new Date());
    refreshAfterEventPages(eventId);
    return "Thanks for your feedback.";
  });
}

export async function sendAnnouncementAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const me = await requireRole(STAFF_ROLES);
  const parsed = announcementSchema.safeParse({
    subject: formData.get("subject"),
    body: formData.get("body"),
  });
  if (!parsed.success) return invalid(parsed.error, formData);

  const eventId = text(formData, "eventId");
  return attempt(formData, async () => {
    const { recipients, emails } = await sendAnnouncement(me, eventId, parsed.data);
    after(() => deliver(emails));
    revalidatePath(`/manage/events/${eventId}/announcements`);
    return recipients === 1 ? "Sent to 1 person." : `Sent to ${recipients} people.`;
  });
}
