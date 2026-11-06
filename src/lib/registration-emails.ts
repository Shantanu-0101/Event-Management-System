import { appUrl, linkEmail, type Email } from "@/lib/email";

// The emails registration sends. Phase 5 replaces these with designed templates
// and adds the "you're confirmed" email carrying the QR ticket.

type Person = { name: string; email: string };
type EventRef = { title: string; slug: string };

function eventEmail(to: Person, event: EventRef, subject: string, body: string): Email {
  return linkEmail({
    to: to.email,
    subject,
    greeting: `Hi ${to.name},`,
    body,
    buttonText: "View event",
    url: appUrl(`/events/${event.slug}`),
    footer: `You're getting this because of your registration for ${event.title} on Campus Events.`,
  });
}

export function promotedEmail(to: Person, event: EventRef, teamName?: string | null) {
  return eventEmail(
    to,
    event,
    `You got a seat: ${event.title}`,
    teamName
      ? `A seat opened up and team ${teamName} moved off the waitlist for ${event.title}. You're confirmed.`
      : `A seat opened up and you moved off the waitlist for ${event.title}. You're confirmed.`,
  );
}

export function teamInviteEmail(to: Person, event: EventRef, teamName: string, leaderName: string) {
  return linkEmail({
    to: to.email,
    subject: `${leaderName} invited you to team ${teamName}`,
    greeting: `Hi ${to.name},`,
    body: `${leaderName} invited you to join team ${teamName} for ${event.title}. Accept or decline from your events page.`,
    buttonText: "See the invite",
    url: appUrl("/my-events"),
    footer: "If you weren't expecting this, you can decline or ignore it.",
  });
}

export function teamRegisteredEmail(
  to: Person,
  event: EventRef,
  teamName: string,
  waitlisted: boolean,
) {
  return eventEmail(
    to,
    event,
    waitlisted ? `Team ${teamName} is on the waitlist` : `Team ${teamName} is registered`,
    waitlisted
      ? `Team ${teamName} has enough members, but ${event.title} is full, so the team joined the waitlist. We'll email you if a seat opens up.`
      : `Team ${teamName} has enough members and is registered for ${event.title}.`,
  );
}

export function teamBelowMinimumEmail(to: Person, event: EventRef, teamName: string, min: number) {
  return eventEmail(
    to,
    event,
    `Team ${teamName} is no longer registered`,
    `Team ${teamName} now has fewer than ${min} members, so it lost its place in ${event.title}. Invite more members before registration closes to register again.`,
  );
}

export function removedFromTeamEmail(to: Person, event: EventRef, teamName: string) {
  return eventEmail(
    to,
    event,
    `You were removed from team ${teamName}`,
    `The leader removed you from team ${teamName} for ${event.title}. You can still join another team while registration is open.`,
  );
}

export function memberLeftEmail(to: Person, event: EventRef, teamName: string, memberName: string) {
  return eventEmail(
    to,
    event,
    `${memberName} left team ${teamName}`,
    `${memberName} left team ${teamName} for ${event.title}.`,
  );
}

export function inviteDeclinedEmail(
  to: Person,
  event: EventRef,
  teamName: string,
  memberName: string,
) {
  return eventEmail(
    to,
    event,
    `${memberName} declined your invite`,
    `${memberName} declined the invite to team ${teamName} for ${event.title}.`,
  );
}

export function teamDisbandedEmail(to: Person, event: EventRef, teamName: string) {
  return eventEmail(
    to,
    event,
    `Team ${teamName} was disbanded`,
    `The leader disbanded team ${teamName} for ${event.title}, so its registration is cancelled. You can still join another team while registration is open.`,
  );
}

export function eventCancelledEmail(to: Person, event: EventRef) {
  return eventEmail(
    to,
    event,
    `Cancelled: ${event.title}`,
    `${event.title} has been cancelled, so your registration no longer applies. Sorry for the change of plans.`,
  );
}
