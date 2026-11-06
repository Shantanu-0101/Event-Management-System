import { CircleCheckIcon, HourglassIcon } from "lucide-react";
import { effectiveStatus } from "@/lib/events";
import {
  canChangeRegistration,
  membersNeeded,
  registrationBlock,
  teamHasRoom,
  windowProblem,
  type Block,
  type RegistrationEvent,
} from "@/lib/registrations";
import {
  acceptInviteAction,
  cancelRegistrationAction,
  declineInviteAction,
  disbandTeamAction,
  leaveTeamAction,
  registerAction,
  removeMemberAction,
} from "@/server/actions/registrations";
import { getRegistrationView } from "@/server/services/registrations";
import type { CurrentUser } from "@/server/session";
import { ButtonLink } from "@/components/button-link";
import {
  ActionButton,
  ConfirmButton,
  CreateTeamForm,
  InviteMemberForm,
} from "@/components/registration-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type PanelEvent = RegistrationEvent & {
  id: string;
  slug: string;
  participation: "SOLO" | "TEAM";
  teamMin: number | null;
  teamMax: number | null;
};

type View = Awaited<ReturnType<typeof getRegistrationView>>;

/** Registering, or where this person already stands. Rules live in lib/registrations.ts. */
export async function RegistrationPanel({
  event,
  user,
  seatsLeft,
  now,
}: {
  event: PanelEvent;
  user: CurrentUser | null;
  seatsLeft: number | null;
  now: Date;
}) {
  if (event.status === "DRAFT") return null;

  const view = user ? await getRegistrationView(event.id, user.id) : null;
  const heading = !user
    ? "Registration"
    : event.participation === "TEAM"
      ? "Your team"
      : "Your registration";

  return (
    <section aria-labelledby="registration-heading" className="grid gap-4 rounded-xl border p-4">
      <h2 id="registration-heading" className="font-semibold">
        {heading}
      </h2>
      {!user || !view ? (
        <SignedOut event={event} now={now} />
      ) : event.participation === "TEAM" ? (
        <TeamPanel event={event} user={user} view={view} seatsLeft={seatsLeft} now={now} />
      ) : (
        <SoloPanel event={event} user={user} view={view} seatsLeft={seatsLeft} now={now} />
      )}
    </section>
  );
}

function SignedOut({ event, now }: { event: PanelEvent; now: Date }) {
  const closed = windowProblem(event, now);
  if (closed) return <Blocked label="Register" block={{ message: closed }} />;
  return (
    <div>
      <ButtonLink href={`/login?next=${encodeURIComponent(`/events/${event.slug}`)}`}>
        Log in to register
      </ButtonLink>
    </div>
  );
}

/** A disabled button always says why, and links to the fix when there is one. */
function Blocked({ label, block }: { label: string; block: Block }) {
  return (
    <div className="grid justify-items-start gap-2">
      <Button disabled aria-describedby="registration-block">
        {label}
      </Button>
      <p id="registration-block" className="text-sm text-muted-foreground">
        {block.message}
      </p>
      {block.fix && (
        <ButtonLink href={block.fix.href} variant="link" size="sm" className="h-auto px-0">
          {block.fix.label}
        </ButtonLink>
      )}
    </div>
  );
}

function isOver(event: PanelEvent, now: Date) {
  const status = effectiveStatus(event, now);
  return status === "COMPLETED" || status === "CANCELLED";
}

function SoloPanel({
  event,
  user,
  view,
  seatsLeft,
  now,
}: {
  event: PanelEvent;
  user: CurrentUser;
  view: View;
  seatsLeft: number | null;
  now: Date;
}) {
  if (view.registration) {
    const waitlisted = view.registration.status === "WAITLISTED";
    return (
      <div className="grid gap-3">
        <Standing waitlisted={waitlisted} rank={view.waitlistRank} over={isOver(event, now)} />
        {canChangeRegistration(event, now) ? (
          <div>
            <ConfirmButton
              action={cancelRegistrationAction}
              fields={{ eventId: event.id }}
              title={waitlisted ? "Leave the waitlist?" : "Cancel your registration?"}
              body={
                waitlisted
                  ? "You'd lose your place in the queue. If you join again, you go to the back."
                  : "Your seat goes to the next person waiting. If you register again, you may end up on the waitlist."
              }
              confirm={waitlisted ? "Leave waitlist" : "Cancel registration"}
            >
              {waitlisted ? "Leave waitlist" : "Cancel registration"}
            </ConfirmButton>
          </div>
        ) : (
          !isOver(event, now) && (
            <p className="text-sm text-muted-foreground">
              Registration has closed, so this can no longer be cancelled.
            </p>
          )
        )}
      </div>
    );
  }

  const full = seatsLeft === 0;
  const label = full ? "Join the waitlist" : "Register";
  const block = registrationBlock(event, user, now);
  if (block) return <Blocked label={label} block={block} />;

  return (
    <div className="grid justify-items-start gap-2">
      <ActionButton action={registerAction} fields={{ eventId: event.id }}>
        {label}
      </ActionButton>
      <p className="text-sm text-muted-foreground">
        {full
          ? "All seats are taken. If someone cancels, the first person waiting gets the seat and an email."
          : "One click. We use the details from your profile."}
      </p>
    </div>
  );
}

function Standing({
  waitlisted,
  rank,
  over,
}: {
  waitlisted: boolean;
  rank: number | null;
  over: boolean;
}) {
  if (waitlisted) {
    return (
      <p className="flex items-start gap-2 text-sm">
        <HourglassIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span>
          {over ? (
            "You were on the waitlist and didn't get a seat."
          ) : (
            <>
              You&apos;re <span className="font-medium">number {rank}</span> on the waitlist.
              We&apos;ll email you if a seat opens up.
            </>
          )}
        </span>
      </p>
    );
  }
  return (
    <p className="flex items-start gap-2 text-sm">
      <CircleCheckIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <span className="font-medium">{over ? "You were registered." : "You're registered."}</span>
    </p>
  );
}

function TeamPanel({
  event,
  user,
  view,
  seatsLeft,
  now,
}: {
  event: PanelEvent;
  user: CurrentUser;
  view: View;
  seatsLeft: number | null;
  now: Date;
}) {
  if (view.team) return <TeamCard event={event} user={user} view={view} now={now} />;

  const block = registrationBlock(event, user, now);
  return (
    <div className="grid gap-4">
      {!block && view.invites.length > 0 && (
        <ul className="grid gap-3">
          {view.invites.map((invite) => (
            <li key={invite.id} className="grid gap-2 rounded-lg bg-muted p-3 text-sm">
              <p>
                <span className="font-medium">{invite.leader.name}</span> invited you to team{" "}
                <span className="font-medium">{invite.name}</span>.
              </p>
              <div className="flex flex-wrap gap-2">
                <ActionButton action={acceptInviteAction} fields={{ teamId: invite.id }} size="sm">
                  Accept
                </ActionButton>
                <ActionButton
                  action={declineInviteAction}
                  fields={{ teamId: invite.id }}
                  variant="outline"
                  size="sm"
                >
                  Decline
                </ActionButton>
              </div>
            </li>
          ))}
        </ul>
      )}

      {block ? (
        <Blocked label="Create a team" block={block} />
      ) : (
        <>
          <CreateTeamForm eventId={event.id} />
          {seatsLeft === 0 && (
            <p className="text-sm text-muted-foreground">
              All seats are taken, so a new team joins the waitlist when it reaches its minimum
              size.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function TeamCard({
  event,
  user,
  view,
  now,
}: {
  event: PanelEvent;
  user: CurrentUser;
  view: View;
  now: Date;
}) {
  const team = view.team;
  if (!team) return null;

  const isLeader = team.leaderId === user.id;
  const accepted = team.members.filter((m) => m.status === "ACCEPTED").length;
  const invited = team.members.length - accepted;
  const needed = membersNeeded(accepted, event.teamMin);
  const canChange = canChangeRegistration(event, now);
  const canInvite = isLeader && !windowProblem(event, now);
  const over = isOver(event, now);

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <p className="text-lg font-semibold break-words">{team.name}</p>
        {view.registration ? (
          <Standing
            waitlisted={view.registration.status === "WAITLISTED"}
            rank={view.waitlistRank}
            over={over}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            {canChange
              ? `Not registered yet. ${needed} more ${needed === 1 ? "member needs" : "members need"} to accept.`
              : `This team didn't reach ${event.teamMin} members in time, so it isn't registered.`}
          </p>
        )}
      </div>

      <ul className="divide-y rounded-lg border">
        {team.members.map((member) => (
          <li key={member.userId} className="flex items-center justify-between gap-3 p-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium break-words">{member.user.name}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {member.user.rollNo && (
                  <span className="text-xs text-muted-foreground">{member.user.rollNo}</span>
                )}
                {member.userId === team.leaderId && <Badge variant="secondary">Leader</Badge>}
                {member.status === "INVITED" && <Badge variant="outline">Invited</Badge>}
              </div>
            </div>
            {isLeader && canChange && member.userId !== team.leaderId && (
              <ConfirmButton
                action={removeMemberAction}
                fields={{ teamId: team.id, userId: member.userId }}
                size="sm"
                ariaLabel={`Remove ${member.user.name}`}
                title={
                  member.status === "INVITED"
                    ? `Withdraw the invite to ${member.user.name}?`
                    : `Remove ${member.user.name}?`
                }
                body={
                  member.status === "INVITED"
                    ? "They won't be able to accept it any more."
                    : `Their registration is cancelled. A team with fewer than ${event.teamMin} members loses its place.`
                }
                confirm="Remove"
              >
                Remove
              </ConfirmButton>
            )}
          </li>
        ))}
      </ul>

      {canInvite &&
        (teamHasRoom(accepted, invited, event.teamMax) ? (
          <InviteMemberForm teamId={team.id} />
        ) : (
          <p className="text-sm text-muted-foreground">
            This team is at the maximum of {event.teamMax} members, counting pending invites.
          </p>
        ))}

      {canChange && (
        <div>
          {isLeader ? (
            <ConfirmButton
              action={disbandTeamAction}
              fields={{ teamId: team.id }}
              title="Disband this team?"
              body="Every member loses their registration, and the team's place goes to the next in line. This can't be undone."
              confirm="Disband team"
            >
              Disband team
            </ConfirmButton>
          ) : (
            <ConfirmButton
              action={leaveTeamAction}
              fields={{ teamId: team.id }}
              title="Leave this team?"
              body={`Your registration is cancelled. A team with fewer than ${event.teamMin} members loses its place.`}
              confirm="Leave team"
            >
              Leave team
            </ConfirmButton>
          )}
        </div>
      )}
      {!canChange && !over && (
        <p className="text-sm text-muted-foreground">
          Registration has closed, so this team can no longer change.
        </p>
      )}
    </div>
  );
}
