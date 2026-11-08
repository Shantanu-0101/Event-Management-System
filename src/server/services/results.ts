import { afterEventProblem, PLACE_LABELS, PLACES, resultsProblem } from "@/lib/certificates";
import type { Email } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { winnerEmail } from "@/lib/registration-emails";
import { removeStaleCertificates } from "@/server/services/certificates";
import { canManageEvent, EventRuleError } from "@/server/services/events";
import { lockEvent, LOCKED_TRANSACTION } from "@/server/services/registrations";
import type { CurrentUser } from "@/server/session";

/** Who can be picked as a winner: people checked in, or teams with someone checked in. */
export async function getWinnerChoices(eventId: string) {
  const attended = await prisma.registration.findMany({
    where: { eventId, status: "CONFIRMED", checkedInAt: { not: null } },
    orderBy: { user: { name: "asc" } },
    select: {
      id: true,
      teamId: true,
      team: { select: { name: true } },
      user: { select: { name: true, rollNo: true } },
    },
  });

  const teams = new Map<string, { value: string; label: string }>();
  const people: { value: string; label: string }[] = [];
  for (const r of attended) {
    if (r.teamId && r.team) {
      teams.set(r.teamId, { value: `team:${r.teamId}`, label: `Team ${r.team.name}` });
    } else {
      const roll = r.user.rollNo ? ` (${r.user.rollNo})` : "";
      people.push({ value: `reg:${r.id}`, label: `${r.user.name}${roll}` });
    }
  }
  return [...teams.values(), ...people];
}

/** The saved winners as form values, in place order, null for an empty place. */
export async function getCurrentPicks(eventId: string) {
  const results = await prisma.result.findMany({ where: { eventId } });
  return PLACES.map((place) => {
    const result = results.find((r) => r.position === place);
    if (!result) return null;
    return result.teamId ? `team:${result.teamId}` : `reg:${result.registrationId}`;
  });
}

/** Winners for the public event page, best first. */
export async function getPublicResults(eventId: string) {
  const results = await prisma.result.findMany({
    where: { eventId },
    orderBy: { position: "asc" },
    select: {
      position: true,
      team: { select: { name: true } },
      registration: { select: { user: { select: { name: true } } } },
    },
  });
  return results.map((r) => ({
    place: PLACE_LABELS[r.position] ?? String(r.position),
    winner: r.team ? `Team ${r.team.name}` : (r.registration?.user.name ?? ""),
  }));
}

/**
 * Replaces the event's winners and tells anyone newly placed. Certificates for
 * someone no longer a winner are taken back at once; new ones wait for "generate".
 */
export async function saveResults(
  actor: Pick<CurrentUser, "id" | "role">,
  eventId: string,
  picks: (string | null)[],
  now: Date,
): Promise<{ emails: Email[] }> {
  const problem = resultsProblem(picks);
  if (problem) throw new EventRuleError(problem);

  return prisma.$transaction(async (tx) => {
    const event = await lockEvent(tx, eventId);
    if (!event) throw new EventRuleError("This event no longer exists.");
    const coordinators = await tx.eventCoordinator.findMany({
      where: { eventId },
      select: { userId: true },
    });
    if (!canManageEvent(actor, { coordinators })) {
      throw new EventRuleError("You don't manage this event.");
    }
    const closed = afterEventProblem(event, now);
    if (closed) throw new EventRuleError(closed);

    const attended = await tx.registration.findMany({
      where: { eventId, status: "CONFIRMED", checkedInAt: { not: null } },
      select: {
        id: true,
        teamId: true,
        user: { select: { id: true, name: true, email: true, isActive: true } },
      },
    });
    const allowed = new Set(attended.map((r) => (r.teamId ? `team:${r.teamId}` : `reg:${r.id}`)));
    if (picks.some((p) => p !== null && !allowed.has(p))) {
      throw new EventRuleError("A winner must have been checked in at this event.");
    }

    const before = await tx.result.findMany({ where: { eventId } });
    const pickOf = (r: { teamId: string | null; registrationId: string | null }) =>
      r.teamId ? `team:${r.teamId}` : `reg:${r.registrationId}`;
    const placedBefore = new Map(before.map((r) => [pickOf(r), r.position]));

    await tx.result.deleteMany({ where: { eventId } });
    const chosen = picks.flatMap((pick, i) => (pick ? [{ pick, position: i + 1 }] : []));
    await tx.result.createMany({
      data: chosen.map(({ pick, position }) => {
        const [kind, id] = pick.split(":");
        return {
          eventId,
          position,
          teamId: kind === "team" ? id : null,
          registrationId: kind === "reg" ? id : null,
        };
      }),
    });
    await removeStaleCertificates(tx, eventId);
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "results.saved",
        entity: "event",
        entityId: eventId,
        meta: { picks },
      },
    });

    // Only people whose place changed hear about it, not everyone each time it's saved.
    const emails = chosen
      .filter(({ pick, position }) => placedBefore.get(pick) !== position)
      .flatMap(({ pick, position }) =>
        attended
          .filter((r) => (r.teamId ? `team:${r.teamId}` : `reg:${r.id}`) === pick)
          .filter((r) => r.user.isActive)
          .map((r) => winnerEmail(r.user, event, PLACE_LABELS[position])),
      );
    return { emails };
  }, LOCKED_TRANSACTION);
}
