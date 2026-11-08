import type { Prisma } from "@/generated/prisma/client";
import type { CertificateType } from "@/generated/prisma/enums";
import { renderCertificates, type CertificateData } from "@/lib/certificate-pdf";
import {
  afterEventProblem,
  CERTIFICATE_LABELS,
  certificateKey,
  certificatesDue,
  PLACE_LABELS,
  placeOf,
} from "@/lib/certificates";
import { normalizeTicketCode } from "@/lib/check-in";
import { appUrl, type Email } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { certificatesReadyEmail } from "@/lib/registration-emails";
import { readUploadedFile } from "@/lib/storage";
import { newVerifyCode } from "@/lib/tickets";
import { formatDate } from "@/lib/time";
import { canManageEvent, EventRuleError } from "@/server/services/events";
import { lockEvent, LOCKED_TRANSACTION } from "@/server/services/registrations";
import type { CurrentUser } from "@/server/session";

type Tx = Prisma.TransactionClient;
type Staff = Pick<CurrentUser, "id" | "role">;

/** Who should hold a certificate on this event right now, going by attendance and results. */
async function dueNow(tx: Tx, eventId: string) {
  const attendees = await tx.registration.findMany({
    where: { eventId, status: "CONFIRMED", checkedInAt: { not: null } },
    select: { id: true, teamId: true },
  });
  const results = await tx.result.findMany({
    where: { eventId },
    select: { position: true, registrationId: true, teamId: true },
  });
  return certificatesDue(attendees, results);
}

/**
 * Takes back certificates that are no longer true, so their verify link stops
 * working: a check-in undone, or a winner changed. Returns how many went.
 */
export async function removeStaleCertificates(tx: Tx, eventId: string) {
  const due = await dueNow(tx, eventId);
  const issued = await tx.certificate.findMany({
    where: { registration: { eventId } },
    select: { id: true, registrationId: true, type: true },
  });
  const keep = new Set(due.map(certificateKey));
  const stale = issued.filter((c) => !keep.has(certificateKey(c))).map((c) => c.id);
  if (stale.length === 0) return 0;
  const { count } = await tx.certificate.deleteMany({ where: { id: { in: stale } } });
  return count;
}

/**
 * Issues every certificate this event owes, and tells each person. Safe to run again
 * after a late check-in or a change of winner: it only adds what's missing.
 */
export async function generateCertificates(
  actor: Staff,
  eventId: string,
  now: Date,
): Promise<{ issued: number; emails: Email[] }> {
  return prisma.$transaction(async (tx) => {
    // Held so a second click can't issue the same certificates alongside this one.
    const event = await lockEvent(tx, eventId);
    if (!event) throw new EventRuleError("This event no longer exists.");
    const coordinators = await tx.eventCoordinator.findMany({
      where: { eventId },
      select: { userId: true },
    });
    if (!canManageEvent(actor, { coordinators })) {
      throw new EventRuleError("You don't manage this event.");
    }
    const problem = afterEventProblem(event, now);
    if (problem) throw new EventRuleError(problem);

    await removeStaleCertificates(tx, eventId);
    const due = await dueNow(tx, eventId);
    const existing = await tx.certificate.findMany({
      where: { registration: { eventId } },
      select: { registrationId: true, type: true },
    });
    const have = new Set(existing.map(certificateKey));
    const missing = due.filter((c) => !have.has(certificateKey(c)));
    if (missing.length === 0) return { issued: 0, emails: [] };

    await tx.certificate.createMany({
      data: missing.map((c) => ({ ...c, verifyCode: newVerifyCode(), issuedAt: now })),
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "certificates.generated",
        entity: "event",
        entityId: eventId,
        meta: { issued: missing.length },
      },
    });

    const people = await tx.registration.findMany({
      where: { id: { in: missing.map((c) => c.registrationId) } },
      select: { id: true, user: { select: { id: true, name: true, email: true, isActive: true } } },
    });
    const emails = people.flatMap(({ id, user }) => {
      const kinds = missing
        .filter((c) => c.registrationId === id)
        .map((c) => CERTIFICATE_LABELS[c.type].toLowerCase());
      return user.isActive ? [certificatesReadyEmail(user, event, kinds)] : [];
    });
    return { issued: missing.length, emails };
  }, LOCKED_TRANSACTION);
}

/** For the coordinator's page: how many are out, and how many more could go out now. */
export async function getCertificateCounts(eventId: string) {
  const [due, issued] = await Promise.all([
    dueNow(prisma, eventId),
    prisma.certificate.count({ where: { registration: { eventId } } }),
  ]);
  return { issued, waiting: Math.max(0, due.length - issued) };
}

// ─── Admin's template ───────────────────────────────────────────────────────

export async function setCertificateTemplate(
  actor: Staff,
  eventId: string,
  url: string | null,
): Promise<void> {
  await prisma.$transaction([
    prisma.event.update({ where: { id: eventId }, data: { certificateTemplateUrl: url } }),
    prisma.auditLog.create({
      data: {
        actorId: actor.id,
        action: url ? "certificates.template_set" : "certificates.template_removed",
        entity: "event",
        entityId: eventId,
      },
    }),
  ]);
}

// ─── Drawing the PDF ────────────────────────────────────────────────────────

const certificateSelect = {
  id: true,
  type: true,
  verifyCode: true,
  issuedAt: true,
  registration: {
    select: {
      id: true,
      userId: true,
      teamId: true,
      user: { select: { name: true } },
      team: { select: { name: true } },
      event: {
        select: {
          id: true,
          title: true,
          slug: true,
          subEvent: true,
          startsAt: true,
          endsAt: true,
          certificateTemplateUrl: true,
          coordinators: { select: { userId: true } },
          results: { select: { position: true, registrationId: true, teamId: true } },
        },
      },
    },
  },
} satisfies Prisma.CertificateSelect;

type CertificateRow = Prisma.CertificateGetPayload<{ select: typeof certificateSelect }>;

export function eventDates(event: { startsAt: Date; endsAt: Date }) {
  const [start, end] = [formatDate(event.startsAt), formatDate(event.endsAt)];
  return start === end ? start : `${start} to ${end}`;
}

export const verifyUrl = (code: string) =>
  appUrl(`/certificates/verify?code=${encodeURIComponent(code)}`);

function toData(row: CertificateRow): CertificateData {
  const { registration: r } = row;
  const place = placeOf({ id: r.id, teamId: r.teamId }, r.event.results);
  return {
    type: row.type,
    name: r.user.name,
    eventTitle: r.event.title,
    subEvent: r.event.subEvent,
    dates: eventDates(r.event),
    place: place ? PLACE_LABELS[place] : null,
    verifyCode: row.verifyCode,
    verifyUrl: verifyUrl(row.verifyCode),
  };
}

const readTemplate = (url: string | null) => (url ? readUploadedFile(url) : null);

/** A safe file name from someone's name, for the download. */
const fileSlug = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60)
    .toLowerCase() || "certificate";

/** One certificate as a PDF, for its owner or for staff of the event. Null means not found. */
export async function downloadCertificate(id: string, viewer: Staff) {
  const row = await prisma.certificate.findUnique({ where: { id }, select: certificateSelect });
  if (!row) return null;
  const { registration: r } = row;
  if (r.userId !== viewer.id && !canManageEvent(viewer, r.event)) return null;

  return {
    filename: `${fileSlug(r.user.name)}-${row.type.toLowerCase()}-${r.event.slug}.pdf`,
    bytes: await renderCertificates(
      [toData(row)],
      await readTemplate(r.event.certificateTemplateUrl),
    ),
  };
}

/** Every certificate of an event in one PDF, for printing. The caller checks the role. */
export async function downloadAllCertificates(
  actor: Staff,
  event: { id: string; slug: string; certificateTemplateUrl: string | null },
) {
  const rows = await prisma.certificate.findMany({
    where: { registration: { eventId: event.id } },
    select: certificateSelect,
    orderBy: [{ type: "desc" }, { registration: { user: { name: "asc" } } }],
  });
  if (rows.length === 0) return null;

  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      action: "certificates.exported",
      entity: "event",
      entityId: event.id,
      meta: { count: rows.length },
    },
  });
  return {
    filename: `${event.slug}-certificates.pdf`,
    bytes: await renderCertificates(
      rows.map(toData),
      await readTemplate(event.certificateTemplateUrl),
    ),
  };
}

/** A sample page with made-up details, to check how a template looks. */
export async function previewCertificate(
  event: {
    slug: string;
    title: string;
    subEvent: string | null;
    startsAt: Date;
    endsAt: Date;
    certificateTemplateUrl: string | null;
  },
  type: CertificateType,
) {
  return {
    filename: `${event.slug}-sample-${type.toLowerCase()}.pdf`,
    bytes: await renderCertificates(
      [
        {
          type,
          name: "Sample Student Name",
          eventTitle: event.title,
          subEvent: event.subEvent,
          dates: eventDates(event),
          place: type === "MERIT" ? PLACE_LABELS[1] : null,
          verifyCode: "SAMPLE000000",
          verifyUrl: verifyUrl("SAMPLE000000"),
        },
      ],
      await readTemplate(event.certificateTemplateUrl),
    ),
  };
}

// ─── Public verify page ─────────────────────────────────────────────────────

/** What the public may see about a certificate: no roll number, email or ticket. */
export async function findCertificateByCode(input: string) {
  const row = await prisma.certificate.findUnique({
    where: { verifyCode: normalizeTicketCode(input) },
    select: certificateSelect,
  });
  if (!row) return null;
  const { registration: r } = row;
  const place = placeOf({ id: r.id, teamId: r.teamId }, r.event.results);
  return {
    type: row.type,
    issuedAt: row.issuedAt,
    name: r.user.name,
    team: r.team?.name ?? null,
    eventTitle: r.event.title,
    eventSlug: r.event.slug,
    subEvent: r.event.subEvent,
    dates: eventDates(r.event),
    place: place ? PLACE_LABELS[place] : null,
  };
}
