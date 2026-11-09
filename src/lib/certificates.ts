import type { CertificateType } from "@/generated/prisma/enums";
import { effectiveStatus, type Schedule } from "@/lib/events";

// Rules for results and certificates that need no database, so they can be unit
// tested and shared by server code and pages.

export const PLACES = [1, 2, 3] as const;
export const PLACE_LABELS: Record<number, string> = { 1: "1st", 2: "2nd", 3: "3rd" };

export const CERTIFICATE_LABELS: Record<CertificateType, string> = {
  PARTICIPATION: "Participation certificate",
  MERIT: "Merit certificate",
};

/** Results and certificates are for finished events; a cancelled one has neither. */
export function afterEventProblem(event: Schedule, now: Date): string | null {
  switch (effectiveStatus(event, now)) {
    case "COMPLETED":
      return null;
    case "CANCELLED":
      return "This event was cancelled.";
    default:
      return "This opens once the event has ended.";
  }
}

/**
 * Why these winners can't be saved, or null when they can. `picks` is in place order
 * (1st, 2nd, 3rd), null for a place left empty. Nobody can hold two places, and a place
 * can't be filled while a higher one is empty.
 */
export function resultsProblem(picks: (string | null)[]): string | null {
  const chosen = picks.filter((p) => p !== null);
  if (new Set(chosen).size !== chosen.length) return "The same winner can't take two places.";
  const firstEmpty = picks.indexOf(null);
  if (firstEmpty !== -1 && picks.slice(firstEmpty).some((p) => p !== null)) {
    return `Choose ${PLACE_LABELS[firstEmpty + 1]} place before the places below it.`;
  }
  return null;
}

/** What "1:r:abc" style form values point at: a person's registration, or a team. */
export type WinnerRef = { registrationId: string | null; teamId: string | null };

type Attendee = { id: string; teamId: string | null };
type Winner = WinnerRef & { position: number };

export function isWinner(attendee: Attendee, result: WinnerRef) {
  return (
    result.registrationId === attendee.id ||
    (result.teamId !== null && result.teamId === attendee.teamId)
  );
}

/** The place this attendee won, or null. */
export function placeOf(attendee: Attendee, results: Winner[]) {
  return results.find((r) => isWinner(attendee, r))?.position ?? null;
}

export type CertificateDue = { registrationId: string; type: CertificateType };

/**
 * Who has which certificate coming. Attending earns participation; winning also earns
 * merit. Only people who were checked in count, so a team member who stayed away gets
 * neither, even if their team won.
 */
export function certificatesDue(attendees: Attendee[], results: Winner[]): CertificateDue[] {
  return attendees.flatMap((attendee) => {
    const due: CertificateDue[] = [{ registrationId: attendee.id, type: "PARTICIPATION" }];
    if (placeOf(attendee, results) !== null)
      due.push({ registrationId: attendee.id, type: "MERIT" });
    return due;
  });
}

export const certificateKey = (c: CertificateDue) => `${c.registrationId}:${c.type}`;
