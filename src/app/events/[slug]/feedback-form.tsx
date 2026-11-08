"use client";

import { useActionState } from "react";
import { initialFormState } from "@/lib/form-state";
import { submitFeedbackAction } from "@/server/actions/after-event";
import { Field, FormMessage, SubmitButton } from "@/components/form";
import { Textarea } from "@/components/ui/textarea";

const RATINGS = [1, 2, 3, 4, 5];

export function FeedbackForm({ eventId }: { eventId: string }) {
  const [state, formAction] = useActionState(submitFeedbackAction, initialFormState);
  const ratingError = state.fieldErrors?.rating?.[0];
  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="eventId" value={eventId} />
      <FormMessage state={state} />
      <fieldset className="grid gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">
          Your rating, from 1 (poor) to 5 (great)
        </legend>
        <div className="flex gap-2">
          {RATINGS.map((rating) => (
            <label key={rating} className="cursor-pointer">
              <input
                type="radio"
                name="rating"
                value={rating}
                required
                defaultChecked={state.values?.rating === String(rating)}
                className="peer sr-only"
              />
              <span className="flex size-10 items-center justify-center rounded-lg border text-sm font-medium peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50">
                {rating}
              </span>
            </label>
          ))}
        </div>
        {ratingError && <p className="text-xs text-destructive">{ratingError}</p>}
      </fieldset>
      <Field
        label="Comment (optional)"
        name="comment"
        state={state}
        hint="Coordinators see this without your name. You can only send it once."
      >
        {(props) => <Textarea {...props} maxLength={1000} rows={3} />}
      </Field>
      <SubmitButton className="w-full sm:w-fit">Send feedback</SubmitButton>
    </form>
  );
}
