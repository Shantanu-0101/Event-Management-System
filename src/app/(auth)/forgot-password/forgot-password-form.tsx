"use client";

import { useActionState } from "react";
import { initialFormState } from "@/lib/form-state";
import { forgotPasswordAction } from "@/server/actions/auth";
import { Field, FormMessage, SubmitButton } from "@/components/form";
import { Input } from "@/components/ui/input";

export function ForgotPasswordForm() {
  const [state, action] = useActionState(forgotPasswordAction, initialFormState);

  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormMessage state={state} />
      <Field label="Email" name="email" state={state}>
        {(p) => <Input {...p} type="email" autoComplete="email" required />}
      </Field>
      <SubmitButton className="w-full">Send reset link</SubmitButton>
    </form>
  );
}
