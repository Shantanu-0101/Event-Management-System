"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { STUDENT_ONLY } from "@/lib/access";
import { sendEmails, type Email } from "@/lib/email";
import { failed, invalid, type FormState } from "@/lib/form-state";
import { teamInviteSchema, teamNameSchema } from "@/lib/schemas";
import {
  cancelRegistration,
  createTeam,
  disbandTeam,
  inviteToTeam,
  leaveTeam,
  registerForEvent,
  RegistrationError,
  removeTeamMember,
  respondToInvite,
} from "@/server/services/registrations";
import { requireRole, requireUser } from "@/server/session";

// Joining needs a student account. Leaving only needs a login, so someone made a
// coordinator after registering can still give up their place. The service
// checks that a person may act on this particular team or registration.

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "");

/** Runs a change, sends its emails after the response, and refreshes every page showing it. */
async function run(
  formData: FormData,
  change: () => Promise<{ emails?: Email[] }>,
  message: string,
): Promise<FormState> {
  try {
    const { emails = [] } = await change();
    if (emails.length > 0) after(() => sendEmails(emails));
    revalidatePath("/", "layout");
    return { ok: true, message };
  } catch (e) {
    if (e instanceof RegistrationError) {
      // What the student was looking at is out of date; show them the real state.
      revalidatePath("/", "layout");
      return failed(e.message, formData, e.field);
    }
    throw e;
  }
}

export async function registerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireRole(STUDENT_ONLY);
  return run(
    formData,
    () => registerForEvent(me, text(formData, "eventId"), new Date()).then(() => ({})),
    "You're in.",
  );
}

export async function cancelRegistrationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const me = await requireUser();
  return run(
    formData,
    () => cancelRegistration(me, text(formData, "eventId"), new Date()),
    "Registration cancelled.",
  );
}

export async function createTeamAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireRole(STUDENT_ONLY);
  const parsed = teamNameSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return invalid(parsed.error, formData);

  return run(
    formData,
    () => createTeam(me, text(formData, "eventId"), parsed.data.name, new Date()),
    "Team created.",
  );
}

export async function inviteMemberAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireRole(STUDENT_ONLY);
  const parsed = teamInviteSchema.safeParse({ member: formData.get("member") });
  if (!parsed.success) return invalid(parsed.error, formData);

  return run(
    formData,
    () => inviteToTeam(me, text(formData, "teamId"), parsed.data.member, new Date()),
    "Invite sent.",
  );
}

export async function acceptInviteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireRole(STUDENT_ONLY);
  return run(
    formData,
    () => respondToInvite(me, text(formData, "teamId"), true, new Date()),
    "You joined the team.",
  );
}

export async function declineInviteAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const me = await requireUser();
  return run(
    formData,
    () => respondToInvite(me, text(formData, "teamId"), false, new Date()),
    "Invite declined.",
  );
}

export async function removeMemberAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireUser();
  return run(
    formData,
    () => removeTeamMember(me, text(formData, "teamId"), text(formData, "userId"), new Date()),
    "Removed from the team.",
  );
}

export async function leaveTeamAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireUser();
  return run(
    formData,
    () => leaveTeam(me, text(formData, "teamId"), new Date()),
    "You left the team.",
  );
}

export async function disbandTeamAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireUser();
  return run(
    formData,
    () => disbandTeam(me, text(formData, "teamId"), new Date()),
    "Team disbanded.",
  );
}
