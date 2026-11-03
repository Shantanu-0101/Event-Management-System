"use client";

import { useActionState } from "react";
import { initialFormState } from "@/lib/form-state";
import { YEARS } from "@/lib/years";
import { signupAction } from "@/server/actions/auth";
import { Field, FormMessage, NativeSelect, SubmitButton } from "@/components/form";
import { Input } from "@/components/ui/input";

export function SignupForm({ departments }: { departments: { id: string; name: string }[] }) {
  const [state, action] = useActionState(signupAction, initialFormState);

  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormMessage state={state} />

      <Field label="Full name" name="name" state={state}>
        {(p) => <Input {...p} autoComplete="name" required maxLength={80} />}
      </Field>
      <Field label="College email" name="email" state={state}>
        {(p) => <Input {...p} type="email" autoComplete="email" required />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Roll number" name="rollNo" state={state}>
          {(p) => <Input {...p} required maxLength={20} className="uppercase" />}
        </Field>
        <Field label="Year" name="year" state={state}>
          {({ defaultValue, ...p }) => (
            <NativeSelect key={defaultValue} {...p} defaultValue={defaultValue ?? ""} required>
              <option value="" disabled>
                Choose…
              </option>
              {YEARS.map((y) => (
                <option key={y.value} value={y.value}>
                  {y.label}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
      </div>
      <Field label="Department" name="departmentId" state={state}>
        {({ defaultValue, ...p }) => (
          <NativeSelect key={defaultValue} {...p} defaultValue={defaultValue ?? ""} required>
            <option value="" disabled>
              Choose your department…
            </option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </NativeSelect>
        )}
      </Field>
      <Field label="Password" name="password" state={state} hint="At least 8 characters.">
        {(p) => (
          <Input
            {...p}
            defaultValue={undefined}
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
          />
        )}
      </Field>
      <Field label="Confirm password" name="confirmPassword" state={state}>
        {(p) => (
          <Input
            {...p}
            defaultValue={undefined}
            type="password"
            autoComplete="new-password"
            required
          />
        )}
      </Field>

      <SubmitButton className="mt-2 w-full">Create account</SubmitButton>
    </form>
  );
}
