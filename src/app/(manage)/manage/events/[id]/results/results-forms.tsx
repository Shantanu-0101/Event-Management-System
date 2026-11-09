"use client";

import { useActionState } from "react";
import { PLACE_LABELS, PLACES } from "@/lib/certificates";
import { initialFormState } from "@/lib/form-state";
import {
  removeCertificateTemplateAction,
  saveResultsAction,
  uploadCertificateTemplateAction,
} from "@/server/actions/after-event";
import { Field, FormMessage, NativeSelect, SubmitButton, useStateToast } from "@/components/form";
import { ActionButton } from "@/components/registration-actions";
import { Input } from "@/components/ui/input";

export function ResultsForm({
  eventId,
  choices,
  picks,
}: {
  eventId: string;
  choices: { value: string; label: string }[];
  picks: (string | null)[];
}) {
  const [state, formAction] = useActionState(saveResultsAction, initialFormState);
  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="eventId" value={eventId} />
      <FormMessage state={state} />
      {PLACES.map((place, i) => (
        <Field
          key={place}
          label={`${PLACE_LABELS[place]} place`}
          name={`place${place}`}
          state={state}
        >
          {({ defaultValue, ...props }) => (
            // React resets a form after its action runs, and a <select> resets to what it
            // first showed. A new key makes it show what was typed, or what was stored.
            <NativeSelect
              key={defaultValue ?? picks[i] ?? ""}
              {...props}
              defaultValue={defaultValue ?? picks[i] ?? ""}
            >
              <option value="">Nobody</option>
              {choices.map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.label}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
      ))}
      <SubmitButton className="w-full sm:w-fit">Save results</SubmitButton>
    </form>
  );
}

export function TemplateForm({ eventId, hasTemplate }: { eventId: string; hasTemplate: boolean }) {
  const [state, formAction] = useActionState(uploadCertificateTemplateAction, initialFormState);
  useStateToast(state);
  return (
    <div className="grid gap-3">
      <form action={formAction} className="grid gap-3">
        <input type="hidden" name="eventId" value={eventId} />
        <Field
          label="Upload a template"
          name="template"
          state={state}
          hint="A PNG, JPG or PDF under 3 MB, A4 landscape, with the middle and bottom right corner left empty. We print the words and QR code there."
        >
          {(props) => (
            <Input {...props} type="file" required accept="image/png,image/jpeg,application/pdf" />
          )}
        </Field>
        <SubmitButton variant="secondary" className="w-full sm:w-fit">
          Save template
        </SubmitButton>
      </form>
      {hasTemplate && (
        <div>
          <ActionButton
            action={removeCertificateTemplateAction}
            fields={{ eventId }}
            variant="ghost"
            size="sm"
          >
            Use the built-in design instead
          </ActionButton>
        </div>
      )}
    </div>
  );
}
