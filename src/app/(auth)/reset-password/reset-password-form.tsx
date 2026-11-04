"use client";

import { useActionState } from "react";
import { initialFormState } from "@/lib/form-state";
import { resetPasswordAction } from "@/server/actions/auth";
import { Field, FormMessage, SubmitButton } from "@/components/form";
import { Input } from "@/components/ui/input";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPasswordAction, initialFormState);

  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="token" value={token} />
      <Field label="New password" name="password" state={state} hint="At least 8 characters.">
        {(p) => <Input {...p} type="password" autoComplete="new-password" required minLength={8} />}
      </Field>
      <Field label="Confirm new password" name="confirmPassword" state={state}>
        {(p) => <Input {...p} type="password" autoComplete="new-password" required />}
      </Field>
      <SubmitButton className="w-full">Save password</SubmitButton>
    </form>
  );
}
