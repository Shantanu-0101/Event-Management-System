"use client";

import { useActionState } from "react";
import { initialFormState } from "@/lib/form-state";
import { resendVerificationAction } from "@/server/actions/auth";
import { SubmitButton, useStateToast } from "@/components/form";

export function ResendVerificationButton() {
  const [state, action] = useActionState(resendVerificationAction, initialFormState);
  useStateToast(state);

  return (
    <form action={action}>
      <SubmitButton variant="link" size="sm" className="h-auto px-0 text-current underline">
        Send a new link
      </SubmitButton>
    </form>
  );
}
