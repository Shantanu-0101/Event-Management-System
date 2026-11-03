"use client";

import { useActionState, useState } from "react";
import { initialFormState, type FormState } from "@/lib/form-state";
import {
  deleteCategoryAction,
  deleteDepartmentAction,
  deleteVenueAction,
  saveCategoryAction,
  saveDepartmentAction,
  saveVenueAction,
} from "@/server/actions/admin";
import { Field, FormMessage, SubmitButton, useStateToast } from "@/components/form";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// Create and edit forms for the admin's lists. Each is used on the list page
// (empty, to add) and on the edit page (filled in). Saving returns to the list.

const val = (state: FormState, name: string, saved?: string | number | null) =>
  state.values?.[name] ?? (saved == null ? "" : String(saved));

export function DepartmentForm({
  department,
}: {
  department?: { id: string; name: string; code: string };
}) {
  const [state, action] = useActionState(saveDepartmentAction, initialFormState);
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormMessage state={state} />
      {department && <input type="hidden" name="id" value={department.id} />}
      <Field label="Name" name="name" state={state}>
        {(p) => <Input {...p} defaultValue={val(state, "name", department?.name)} required />}
      </Field>
      <Field label="Short code" name="code" state={state} hint="Shown in tables, e.g. CSE.">
        {(p) => (
          <Input
            {...p}
            defaultValue={val(state, "code", department?.code)}
            required
            maxLength={10}
            className="uppercase"
          />
        )}
      </Field>
      <SubmitButton className="w-fit">
        {department ? "Save changes" : "Add department"}
      </SubmitButton>
    </form>
  );
}

export function CategoryForm({
  category,
}: {
  category?: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    icon: string | null;
    sortOrder: number;
    isActive: boolean;
  };
}) {
  const [state, action] = useActionState(saveCategoryAction, initialFormState);
  const isActive = state.values ? state.values.isActive === "on" : (category?.isActive ?? true);
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormMessage state={state} />
      {category && <input type="hidden" name="id" value={category.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" name="name" state={state}>
          {(p) => <Input {...p} defaultValue={val(state, "name", category?.name)} required />}
        </Field>
        <Field
          label="Web address"
          name="slug"
          state={state}
          hint="Left empty, it's made from the name."
        >
          {(p) => <Input {...p} defaultValue={val(state, "slug", category?.slug)} />}
        </Field>
      </div>
      <Field label="Description" name="description" state={state}>
        {(p) => (
          <Textarea
            {...p}
            defaultValue={val(state, "description", category?.description)}
            rows={2}
            maxLength={300}
          />
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Icon"
          name="icon"
          state={state}
          hint="A lucide.dev icon name, e.g. trophy, music, code."
        >
          {(p) => <Input {...p} defaultValue={val(state, "icon", category?.icon)} />}
        </Field>
        <Field label="Order on the home page" name="sortOrder" state={state}>
          {(p) => (
            <Input
              {...p}
              defaultValue={val(state, "sortOrder", category?.sortOrder ?? 0)}
              type="number"
              min={0}
              max={999}
            />
          )}
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          key={String(isActive)}
          type="checkbox"
          name="isActive"
          defaultChecked={isActive}
          className="size-4 accent-primary"
        />
        Shown on the site
      </label>
      <SubmitButton className="w-fit">{category ? "Save changes" : "Add category"}</SubmitButton>
    </form>
  );
}

export function VenueForm({
  venue,
}: {
  venue?: { id: string; name: string; building: string | null; capacity: number | null };
}) {
  const [state, action] = useActionState(saveVenueAction, initialFormState);
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormMessage state={state} />
      {venue && <input type="hidden" name="id" value={venue.id} />}
      <Field label="Name" name="name" state={state}>
        {(p) => <Input {...p} defaultValue={val(state, "name", venue?.name)} required />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Building" name="building" state={state}>
          {(p) => <Input {...p} defaultValue={val(state, "building", venue?.building)} />}
        </Field>
        <Field label="Seats" name="capacity" state={state} hint="Leave empty for open grounds.">
          {(p) => (
            <Input
              {...p}
              defaultValue={val(state, "capacity", venue?.capacity)}
              type="number"
              min={1}
            />
          )}
        </Field>
      </div>
      <SubmitButton className="w-fit">{venue ? "Save changes" : "Add venue"}</SubmitButton>
    </form>
  );
}

const deleteActions = {
  department: deleteDepartmentAction,
  category: deleteCategoryAction,
  venue: deleteVenueAction,
};

/** Delete with a confirm step. The server refuses rows still in use. */
export function DeleteButton({
  kind,
  id,
  name,
}: {
  kind: keyof typeof deleteActions;
  id: string;
  name: string;
}) {
  const [state, action, pending] = useActionState(deleteActions[kind], initialFormState);
  // Controlled so the dialog closes on submit; the toast shows the outcome.
  const [open, setOpen] = useState(false);
  useStateToast(state);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant="ghost" size="sm" disabled={pending} />}>
        Delete
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
          <AlertDialogDescription>This can&apos;t be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <form action={action} onSubmit={() => setOpen(false)}>
            <input type="hidden" name="id" value={id} />
            <AlertDialogAction type="submit" variant="destructive">
              Delete
            </AlertDialogAction>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
