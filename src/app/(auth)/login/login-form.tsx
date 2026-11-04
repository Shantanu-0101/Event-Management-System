"use client";

import { useActionState } from "react";
import Link from "next/link";
import { initialFormState } from "@/lib/form-state";
import { googleSignInAction, loginAction } from "@/server/actions/auth";
import { Field, FormMessage, SubmitButton } from "@/components/form";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

export function LoginForm({
  next,
  googleEnabled,
  notice,
}: {
  next: string;
  googleEnabled: boolean;
  notice?: { ok: boolean; text: string };
}) {
  const [state, action] = useActionState(loginAction, initialFormState);
  const shown = state.message ? state : notice ? { ok: notice.ok, message: notice.text } : state;

  return (
    <div className="grid gap-5">
      <FormMessage state={shown} />

      <form action={action} className="grid gap-4" noValidate>
        <input type="hidden" name="next" value={next} />
        <Field label="Email" name="email" state={state}>
          {(p) => <Input {...p} type="email" autoComplete="email" required />}
        </Field>
        <Field label="Password" name="password" state={state}>
          {(p) => (
            <Input
              {...p}
              defaultValue={undefined}
              type="password"
              autoComplete="current-password"
              required
            />
          )}
        </Field>
        <div className="-mt-2 text-right">
          <Link
            href="/forgot-password"
            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <SubmitButton className="w-full">Log in</SubmitButton>
      </form>

      {googleEnabled && (
        <>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <Separator className="flex-1" /> or <Separator className="flex-1" />
          </div>
          <form action={googleSignInAction}>
            <input type="hidden" name="next" value={next} />
            <SubmitButton variant="outline" className="w-full">
              Continue with college Google account
            </SubmitButton>
          </form>
        </>
      )}
    </div>
  );
}
