"use client";

import { useActionState, useRef, useState } from "react";
import type { Role } from "@/generated/prisma/enums";
import { initialFormState } from "@/lib/form-state";
import { changeRoleAction, setActiveAction } from "@/server/actions/admin";
import { NativeSelect, useStateToast } from "@/components/form";
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

/** Role dropdown that saves as soon as a new role is picked. */
export function RoleSelect({
  userId,
  role,
  disabled,
}: {
  userId: string;
  role: Role;
  disabled?: boolean;
}) {
  const [state, action, pending] = useActionState(changeRoleAction, initialFormState);
  const formRef = useRef<HTMLFormElement>(null);
  useStateToast(state);

  return (
    <form ref={formRef} action={action}>
      <input type="hidden" name="userId" value={userId} />
      <NativeSelect
        // Re-mount after each save so a refused change snaps back.
        key={`${role}-${JSON.stringify(state)}`}
        name="role"
        defaultValue={role}
        disabled={disabled || pending}
        aria-label="Role"
        className="w-36"
        onChange={() => formRef.current?.requestSubmit()}
      >
        <option value="STUDENT">Student</option>
        <option value="COORDINATOR">Coordinator</option>
        <option value="ADMIN">Admin</option>
      </NativeSelect>
    </form>
  );
}

/** Deactivate (with a confirm step) or reactivate an account. */
export function ActiveToggle({
  userId,
  name,
  isActive,
}: {
  userId: string;
  name: string;
  isActive: boolean;
}) {
  const [state, action, pending] = useActionState(setActiveAction, initialFormState);
  const [open, setOpen] = useState(false);
  useStateToast(state);

  const form = (
    <form action={action} onSubmit={() => setOpen(false)}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="isActive" value={String(!isActive)} />
      {isActive ? (
        <AlertDialogAction type="submit" variant="destructive">
          Deactivate
        </AlertDialogAction>
      ) : (
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          Reactivate
        </Button>
      )}
    </form>
  );

  if (!isActive) return form;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant="ghost" size="sm" disabled={pending} />}>
        Deactivate
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Deactivate {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            They are signed out at once and can&apos;t log in until an admin reactivates the
            account. Their registrations and history are kept.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          {form}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
