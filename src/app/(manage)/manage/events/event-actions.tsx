"use client";

import { useActionState, useState } from "react";
import type { StatusAction } from "@/lib/events";
import { initialFormState } from "@/lib/form-state";
import { changeEventStatusAction, duplicateEventAction } from "@/server/actions/events";
import { SubmitButton, useStateToast } from "@/components/form";
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

const COPY: Record<
  StatusAction,
  { button: string; title: string; body: string; destructive?: boolean }
> = {
  publish: {
    button: "Publish",
    title: "Publish this event?",
    body: "It appears on the public events page straight away.",
  },
  close: {
    button: "Close registration",
    title: "Close registration?",
    body: "The event stays visible, but registration ends now.",
  },
  reopen: {
    button: "Reopen registration",
    title: "Reopen registration?",
    body: "Registration opens again until the closing date set on this event.",
  },
  cancel: {
    button: "Cancel event",
    title: "Cancel this event?",
    body: "Everyone registered gets an email. The event stays visible, marked as cancelled. This can't be undone, and the event can't be edited afterwards.",
    destructive: true,
  },
};

/** One status change, behind a confirm step. */
export function StatusActionButton({ eventId, action }: { eventId: string; action: StatusAction }) {
  const [state, formAction, pending] = useActionState(changeEventStatusAction, initialFormState);
  const [open, setOpen] = useState(false);
  useStateToast(state);
  const copy = COPY[action];

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button variant={copy.destructive ? "outline" : "default"} size="sm" disabled={pending} />
        }
      >
        {copy.button}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription>{copy.body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep as is</AlertDialogCancel>
          <form action={formAction} onSubmit={() => setOpen(false)}>
            <input type="hidden" name="id" value={eventId} />
            <input type="hidden" name="action" value={action} />
            <AlertDialogAction type="submit" variant={copy.destructive ? "destructive" : "default"}>
              {copy.button}
            </AlertDialogAction>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Makes a draft copy and opens it for editing. */
export function DuplicateEventButton({ eventId }: { eventId: string }) {
  const [state, action] = useActionState(duplicateEventAction, initialFormState);
  useStateToast(state);
  return (
    <form action={action} className="inline-block">
      <input type="hidden" name="id" value={eventId} />
      <SubmitButton variant="ghost" size="sm">
        Duplicate
      </SubmitButton>
    </form>
  );
}
