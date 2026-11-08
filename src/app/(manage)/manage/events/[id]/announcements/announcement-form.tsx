"use client";

import { useActionState } from "react";
import { initialFormState } from "@/lib/form-state";
import { sendAnnouncementAction } from "@/server/actions/after-event";
import { Field, FormMessage, SubmitButton } from "@/components/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function AnnouncementForm({ eventId, audience }: { eventId: string; audience: number }) {
  const [state, formAction] = useActionState(sendAnnouncementAction, initialFormState);
  // Empty again after a send, so the same message can't go out twice by accident.
  const values = state.ok ? {} : state.values;
  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="eventId" value={eventId} />
      <FormMessage state={state} />
      <Field label="Subject" name="subject" state={{ ...state, values }}>
        {(props) => <Input {...props} required minLength={3} maxLength={120} />}
      </Field>
      <Field label="Message" name="body" state={{ ...state, values }}>
        {(props) => <Textarea {...props} required minLength={3} maxLength={2000} rows={6} />}
      </Field>
      <SubmitButton className="w-full sm:w-fit">
        Send to {audience} {audience === 1 ? "person" : "people"}
      </SubmitButton>
    </form>
  );
}
