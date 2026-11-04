"use client";

import { useActionState, useState } from "react";
import { initialFormState } from "@/lib/form-state";
import { YEARS } from "@/lib/years";
import type { CurrentUser } from "@/server/session";
import { updateProfileAction } from "@/server/actions/profile";
import { Field, FormMessage, NativeSelect, SubmitButton, useStateToast } from "@/components/form";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";

export function ProfileForm({
  user,
  departments,
}: {
  user: CurrentUser;
  departments: { id: string; name: string }[];
}) {
  const [state, action] = useActionState(updateProfileAction, initialFormState);
  const [preview, setPreview] = useState<string | null>(null);
  useStateToast(state.ok ? state : {});

  // After an error, show what the user typed; otherwise the saved value.
  const v = (name: string, saved: string | number | null) =>
    state.values?.[name] ?? (saved === null ? "" : String(saved));
  const department = departments.find((d) => d.id === user.departmentId);

  return (
    <form action={action} className="grid gap-5" noValidate>
      {!state.ok && <FormMessage state={state} />}

      <div className="flex items-center gap-4">
        <Avatar className="size-16">
          {(preview ?? user.photoUrl) && <AvatarImage src={preview ?? user.photoUrl!} alt="" />}
          <AvatarFallback className="text-lg">{user.name.slice(0, 1).toUpperCase()}</AvatarFallback>
        </Avatar>
        <Field
          label="Photo"
          name="photo"
          state={state}
          hint="JPG, PNG or WebP, up to 3 MB. Shown to coordinators at check-in."
          className="flex-1"
        >
          {(p) => (
            <Input
              {...p}
              defaultValue={undefined}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                setPreview(file ? URL.createObjectURL(file) : null);
              }}
            />
          )}
        </Field>
      </div>

      <Field label="Full name" name="name" state={state}>
        {(p) => <Input {...p} defaultValue={v("name", user.name)} required maxLength={80} />}
      </Field>

      <div className="grid gap-1.5">
        <span className="text-sm font-medium">Email</span>
        <p className="text-sm text-muted-foreground">
          {user.email} {user.emailVerified ? "· verified" : "· not verified yet"}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {user.rollNo ? (
          <ReadOnly label="Roll number" value={user.rollNo} />
        ) : (
          <Field label="Roll number" name="rollNo" state={state}>
            {(p) => (
              <Input {...p} defaultValue={v("rollNo", null)} maxLength={20} className="uppercase" />
            )}
          </Field>
        )}
        <Field label="Year" name="year" state={state}>
          {(p) => (
            <NativeSelect key={v("year", user.year)} {...p} defaultValue={v("year", user.year)}>
              <option value="">Not set</option>
              {YEARS.map((y) => (
                <option key={y.value} value={y.value}>
                  {y.label}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
      </div>

      {department ? (
        <ReadOnly label="Department" value={department.name} />
      ) : (
        <Field label="Department" name="departmentId" state={state}>
          {(p) => (
            <NativeSelect
              key={v("departmentId", null)}
              {...p}
              defaultValue={v("departmentId", null)}
            >
              <option value="">Not set</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
      )}

      <Field
        label="Mobile number"
        name="phone"
        state={state}
        hint="Only coordinators of your events see it."
      >
        {(p) => (
          <Input
            {...p}
            defaultValue={v("phone", user.phone)}
            type="tel"
            autoComplete="tel"
            inputMode="tel"
          />
        )}
      </Field>

      <SubmitButton className="w-fit">Save profile</SubmitButton>
    </form>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <p className="flex h-8 items-center text-sm text-muted-foreground">{value}</p>
    </div>
  );
}
