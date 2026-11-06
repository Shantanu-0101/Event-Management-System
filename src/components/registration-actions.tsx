"use client";

import { useActionState, useState } from "react";
import { initialFormState, type FormState } from "@/lib/form-state";
import { Field, SubmitButton, useStateToast } from "@/components/form";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createTeamAction, inviteMemberAction } from "@/server/actions/registrations";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;
type Fields = Record<string, string>;

function HiddenFields({ fields }: { fields: Fields }) {
  return Object.entries(fields).map(([name, value]) => (
    <input key={name} type="hidden" name={name} value={value} />
  ));
}

/** One click, one change: register, accept, decline. */
export function ActionButton({
  action,
  fields,
  children,
  variant,
  size,
  className,
}: {
  action: Action;
  fields: Fields;
  children: React.ReactNode;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  useStateToast(state);
  return (
    <form action={formAction} className="contents">
      <HiddenFields fields={fields} />
      <SubmitButton variant={variant} size={size} className={className}>
        {children}
      </SubmitButton>
    </form>
  );
}

/** A change someone can't take back in one click: cancel, leave, remove, disband. */
export function ConfirmButton({
  action,
  fields,
  children,
  title,
  body,
  confirm,
  size,
  ariaLabel,
}: {
  action: Action;
  fields: Fields;
  children: React.ReactNode;
  title: string;
  body: string;
  confirm: string;
  size?: React.ComponentProps<typeof Button>["size"];
  ariaLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  const [open, setOpen] = useState(false);
  useStateToast(state);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={<Button variant="outline" size={size} disabled={pending} aria-label={ariaLabel} />}
      >
        {children}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep as is</AlertDialogCancel>
          <form action={formAction} onSubmit={() => setOpen(false)}>
            <HiddenFields fields={fields} />
            <AlertDialogAction type="submit" variant="destructive">
              {confirm}
            </AlertDialogAction>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function CreateTeamForm({ eventId }: { eventId: string }) {
  const [state, formAction] = useActionState(createTeamAction, initialFormState);
  useStateToast(state.fieldErrors ? {} : state);
  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="eventId" value={eventId} />
      <Field
        label="Team name"
        name="name"
        state={state}
        hint="You become the team leader, then invite your teammates."
      >
        {(props) => <Input {...props} required minLength={2} maxLength={60} autoComplete="off" />}
      </Field>
      <SubmitButton className="w-full sm:w-fit">Create team</SubmitButton>
    </form>
  );
}

export function InviteMemberForm({ teamId }: { teamId: string }) {
  const [state, formAction] = useActionState(inviteMemberAction, initialFormState);
  useStateToast(state.fieldErrors ? {} : state);
  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="teamId" value={teamId} />
      <Field
        label="Invite a teammate"
        name="member"
        state={state}
        hint="Their roll number or email. They need an account here."
      >
        {(props) => <Input {...props} required minLength={3} maxLength={254} autoComplete="off" />}
      </Field>
      <SubmitButton variant="secondary" className="w-full sm:w-fit">
        Send invite
      </SubmitButton>
    </form>
  );
}
