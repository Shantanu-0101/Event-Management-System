import { appUrl, linkEmail, type Email } from "@/lib/email";
import { formatRange } from "@/lib/time";

// The words of every email about someone's place in an event. Each one is also a
// notification on that person's bell, so both always say the same thing.

type Person = { id: string; name: string; email: string };
type EventRef = { title: string; slug: string };
type EventDetails = EventRef & {
  startsAt: Date;
  endsAt: Date;
  venue?: { name: string; building: string | null } | null;
};
type Ticket = { id: string; ticketCode: string | null };

/** The When and Where lines shown on anything someone might plan their day around. */
export function eventDetails(event: EventDetails) {
  return [
    { label: "When", value: formatRange(event.startsAt, event.endsAt) },
    {
      label: "Where",
      value: event.venue
        ? [event.venue.name, event.venue.building].filter(Boolean).join(", ")
        : "To be announced",
    },
  ];
}

function eventEmail(
  to: Person,
  event: EventRef,
  subject: string,
  paragraphs: string | string[],
  extra: Partial<Pick<Email, "ticketCode">> & {
    details?: { label: string; value: string }[];
    button?: { text: string; path: string };
  } = {},
): Email {
  const path = extra.button?.path ?? `/events/${event.slug}`;
  return {
    to: to.email,
    subject,
    ticketCode: extra.ticketCode,
    notify: { userId: to.id, link: path },
    content: {
      heading: subject,
      greeting: `Hi ${to.name},`,
      paragraphs: Array.isArray(paragraphs) ? paragraphs : [paragraphs],
      details: extra.details,
      button: { text: extra.button?.text ?? "View event", url: appUrl(path) },
      footer: `You're getting this because of your registration for ${event.title} on CSMSS Events.`,
    },
  };
}

/** What every confirmed person gets: their own QR ticket and how to use it. */
function ticketParts(event: EventDetails, ticket: Ticket) {
  return {
    ticketCode: ticket.ticketCode ?? undefined,
    details: eventDetails(event),
    button: { text: "Show ticket", path: `/my-events/${ticket.id}/ticket` },
  };
}

const AT_THE_DOOR =
  "Show the QR code below at the entrance. Don't share it: it can only be used once.";

export function confirmedEmail(to: Person, event: EventDetails, ticket: Ticket) {
  return eventEmail(
    to,
    event,
    `You're confirmed: ${event.title}`,
    [`You have a seat at ${event.title}.`, AT_THE_DOOR],
    ticketParts(event, ticket),
  );
}

export function waitlistedEmail(to: Person, event: EventRef) {
  return eventEmail(
    to,
    event,
    `You're on the waitlist: ${event.title}`,
    `${event.title} is full, so you joined the waitlist. We'll email you if a seat opens up.`,
  );
}

export function promotedEmail(
  to: Person,
  event: EventDetails,
  ticket: Ticket,
  teamName?: string | null,
) {
  return eventEmail(
    to,
    event,
    `You got a seat: ${event.title}`,
    [
      teamName
        ? `A seat opened up and team ${teamName} moved off the waitlist for ${event.title}. You're confirmed.`
        : `A seat opened up and you moved off the waitlist for ${event.title}. You're confirmed.`,
      AT_THE_DOOR,
    ],
    ticketParts(event, ticket),
  );
}

export function teamInviteEmail(to: Person, event: EventRef, teamName: string, leaderName: string) {
  return {
    ...linkEmail({
      to: to.email,
      subject: `${leaderName} invited you to team ${teamName}`,
      greeting: `Hi ${to.name},`,
      body: `${leaderName} invited you to join team ${teamName} for ${event.title}. Accept or decline from your events page.`,
      buttonText: "See the invite",
      url: appUrl("/my-events"),
      footer: "If you weren't expecting this, you can decline or ignore it.",
    }),
    notify: { userId: to.id, link: "/my-events" },
  };
}

export function teamConfirmedEmail(
  to: Person,
  event: EventDetails,
  teamName: string,
  ticket: Ticket,
) {
  return eventEmail(
    to,
    event,
    `Team ${teamName} is registered`,
    [`Team ${teamName} has enough members and is registered for ${event.title}.`, AT_THE_DOOR],
    ticketParts(event, ticket),
  );
}

export function teamWaitlistedEmail(to: Person, event: EventRef, teamName: string) {
  return eventEmail(
    to,
    event,
    `Team ${teamName} is on the waitlist`,
    `Team ${teamName} has enough members, but ${event.title} is full, so the team joined the waitlist. We'll email you if a seat opens up.`,
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

export function eventChangedEmail(to: Person, event: EventDetails, whatChanged: string) {
  return eventEmail(
    to,
    event,
    `Changed: ${event.title}`,
    `The ${whatChanged} for ${event.title} changed. Here are the new details.`,
    { details: eventDetails(event) },
  );
}

export function reminderEmail(to: Person, event: EventDetails, registrationId: string) {
  return eventEmail(
    to,
    event,
    `Reminder: ${event.title} starts soon`,
    `${event.title} starts soon. Keep your ticket ready to show at the entrance.`,
    {
      details: eventDetails(event),
      button: { text: "Show ticket", path: `/my-events/${registrationId}/ticket` },
    },
  );
}

export function announcementEmail(to: Person, event: EventRef, subject: string, body: string) {
  return eventEmail(to, event, `${event.title}: ${subject}`, body);
}

export function winnerEmail(to: Person, event: EventRef, place: string) {
  return eventEmail(
    to,
    event,
    `You came ${place}: ${event.title}`,
    `Congratulations! The results for ${event.title} are out, and you came ${place}.`,
  );
}

/** One message per person, even for a winner getting two certificates at once. */
export function certificatesReadyEmail(to: Person, event: EventRef, kinds: string[]) {
  const many = kinds.length > 1;
  return eventEmail(
    to,
    event,
    `Your ${many ? "certificates are" : "certificate is"} ready: ${event.title}`,
    `Your ${kinds.join(" and ")} for ${event.title} ${many ? "are" : "is"} ready to download.`,
    {
      button: { text: many ? "Get your certificates" : "Get your certificate", path: "/my-events" },
    },
  );
}
