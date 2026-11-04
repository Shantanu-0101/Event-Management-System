"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { FileTextIcon, LoaderCircleIcon } from "lucide-react";
import { initialFormState, type FormState } from "@/lib/form-state";
import { MAX_UPLOAD_BYTES } from "@/lib/upload-limits";
import { YEARS } from "@/lib/years";
import { saveEventAction, uploadEventFileAction } from "@/server/actions/events";
import { Field, FormMessage, NativeSelect, SubmitButton } from "@/components/form";
import { RichTextEditor } from "@/components/rich-text-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type EventFormData = {
  id: string;
  title: string;
  categoryId: string;
  subEvent: string | null;
  description: string;
  posterUrl: string | null;
  rulesUrl: string | null;
  venueId: string | null;
  // Already in the form the datetime-local inputs need, in India time.
  startsAt: string;
  endsAt: string;
  regOpensAt: string;
  regClosesAt: string;
  capacity: number | null;
  participation: "SOLO" | "TEAM";
  teamMin: number | null;
  teamMax: number | null;
  seatPer: "TEAM" | "MEMBER";
  departmentIds: string[];
  years: number[];
  coordinatorIds: string[];
};

export type EventFormOptions = {
  categories: { id: string; name: string }[];
  venues: { id: string; name: string; capacity: number | null }[];
  departments: { id: string; name: string; code: string }[];
  coordinators: { id: string; name: string; email: string }[];
};

export function EventForm({
  event,
  options,
  canAssignCoordinators,
}: {
  event?: EventFormData;
  options: EventFormOptions;
  canAssignCoordinators: boolean;
}) {
  const [state, action, saving] = useActionState(saveEventAction, initialFormState);
  const [, startSubmit] = useTransition();
  const [participation, setParticipation] = useState(event?.participation ?? "SOLO");
  const [departmentIds, setDepartmentIds] = useState(event?.departmentIds ?? []);
  const [years, setYears] = useState((event?.years ?? []).map(String));
  // Someone assigned earlier may have lost the role since; they can't be kept.
  const [coordinatorIds, setCoordinatorIds] = useState(
    (event?.coordinatorIds ?? []).filter((id) => options.coordinators.some((c) => c.id === id)),
  );

  // A long form: bring the first problem into view, wherever the button was.
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state.message || state.ok) return;
    const target =
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? formRef.current;
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [state]);

  const v = (name: string, saved?: string | number | null) =>
    state.values?.[name] ?? (saved == null ? "" : String(saved));

  return (
    <form
      ref={formRef}
      action={action}
      // Submitted by hand: after a <form action> runs, React resets the form,
      // which unticks every box and sets the selects back to their defaults
      // while their state still says otherwise. This form keeps what was entered.
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startSubmit(() => action(data));
      }}
      className="grid gap-6"
      noValidate
    >
      <FormMessage state={state} />
      {event && <input type="hidden" name="id" value={event.id} />}

      <Section title="Basics">
        <Field label="Title" name="title" state={state}>
          {(p) => <Input {...p} defaultValue={v("title", event?.title)} required maxLength={120} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" name="categoryId" state={state}>
            {(p) => (
              <NativeSelect
                key={v("categoryId", event?.categoryId)}
                {...p}
                defaultValue={v("categoryId", event?.categoryId)}
                required
              >
                <option value="">Choose…</option>
                {options.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Field
            label="Sub-event"
            name="subEvent"
            state={state}
            hint="Optional, e.g. Cricket under Sports."
          >
            {(p) => <Input {...p} defaultValue={v("subEvent", event?.subEvent)} maxLength={80} />}
          </Field>
        </div>
        <Field label="Description" name="description" state={state}>
          {(p) => (
            <RichTextEditor
              id={p.id}
              name={p.name}
              label="Description"
              defaultValue={event?.description ?? ""}
              invalid={p["aria-invalid"]}
              describedBy={p["aria-describedby"]}
            />
          )}
        </Field>
      </Section>

      <Section title="Schedule" hint="All times are India time.">
        <div className="grid gap-4 sm:grid-cols-2">
          <DateTimeField label="Starts" name="startsAt" state={state} saved={event?.startsAt} />
          <DateTimeField label="Ends" name="endsAt" state={state} saved={event?.endsAt} />
          <DateTimeField
            label="Registration opens"
            name="regOpensAt"
            state={state}
            saved={event?.regOpensAt}
          />
          <DateTimeField
            label="Registration closes"
            name="regClosesAt"
            state={state}
            saved={event?.regClosesAt}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Venue" name="venueId" state={state}>
            {(p) => (
              <NativeSelect
                key={v("venueId", event?.venueId)}
                {...p}
                defaultValue={v("venueId", event?.venueId)}
              >
                <option value="">To be announced</option>
                {options.venues.map((venue) => (
                  <option key={venue.id} value={venue.id}>
                    {venue.name}
                    {venue.capacity ? ` (${venue.capacity} seats)` : ""}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Field label="Seat limit" name="capacity" state={state} hint="Leave empty for no limit.">
            {(p) => (
              <Input
                {...p}
                defaultValue={v("capacity", event?.capacity)}
                type="number"
                inputMode="numeric"
                min={1}
              />
            )}
          </Field>
        </div>
      </Section>

      <Section title="Who can join">
        <Field label="Participation" name="participation" state={state}>
          {(p) => (
            <NativeSelect
              {...p}
              defaultValue={undefined}
              value={participation}
              onChange={(e) => setParticipation(e.target.value as "SOLO" | "TEAM")}
            >
              <option value="SOLO">Solo</option>
              <option value="TEAM">Team</option>
            </NativeSelect>
          )}
        </Field>
        {participation === "TEAM" && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Smallest team" name="teamMin" state={state}>
              {(p) => (
                <Input
                  {...p}
                  defaultValue={v("teamMin", event?.teamMin)}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={50}
                  required
                />
              )}
            </Field>
            <Field label="Largest team" name="teamMax" state={state}>
              {(p) => (
                <Input
                  {...p}
                  defaultValue={v("teamMax", event?.teamMax)}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={50}
                  required
                />
              )}
            </Field>
            <Field label="A seat is taken by" name="seatPer" state={state}>
              {(p) => (
                <NativeSelect
                  key={v("seatPer", event?.seatPer ?? "TEAM")}
                  {...p}
                  defaultValue={v("seatPer", event?.seatPer ?? "TEAM")}
                >
                  <option value="TEAM">Each team</option>
                  <option value="MEMBER">Each member</option>
                </NativeSelect>
              )}
            </Field>
          </div>
        )}
        <CheckboxGroup
          legend="Departments"
          hint="Tick none to allow every department."
          name="departmentIds"
          selected={departmentIds}
          onChange={setDepartmentIds}
          options={options.departments.map((d) => ({ value: d.id, label: d.name }))}
        />
        <CheckboxGroup
          legend="Years"
          hint="Tick none to allow every year."
          name="years"
          selected={years}
          onChange={setYears}
          options={YEARS}
        />
      </Section>

      <Section title="Poster and rules">
        <div className="grid gap-4 sm:grid-cols-2">
          <UploadField
            label="Poster"
            name="posterUrl"
            kind="poster"
            accept="image/jpeg,image/png,image/webp"
            hint="JPG, PNG or WebP, up to 3 MB."
            state={state}
            saved={event?.posterUrl ?? ""}
          />
          <UploadField
            label="Rules"
            name="rulesUrl"
            kind="rules"
            accept="application/pdf"
            hint="PDF, up to 3 MB."
            state={state}
            saved={event?.rulesUrl ?? ""}
          />
        </div>
      </Section>

      {canAssignCoordinators && (
        <Section title="Coordinators">
          {options.coordinators.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No coordinators yet. Give someone the Coordinator role under Users, then assign them
              here.
            </p>
          ) : (
            <CheckboxGroup
              legend="Who runs this event"
              hint="They can edit it and, later, check people in."
              name="coordinatorIds"
              selected={coordinatorIds}
              onChange={setCoordinatorIds}
              options={options.coordinators.map((c) => ({
                value: c.id,
                label: `${c.name} (${c.email})`,
              }))}
            />
          )}
        </Section>
      )}

      <SubmitButton className="w-fit" pending={saving}>
        {event ? "Save changes" : "Save as draft"}
      </SubmitButton>
    </form>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-4">
      <div>
        <h2 className="font-medium">{title}</h2>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function DateTimeField({
  label,
  name,
  state,
  saved,
}: {
  label: string;
  name: string;
  state: FormState;
  saved?: string;
}) {
  return (
    <Field label={label} name={name} state={state}>
      {(p) => (
        <Input
          {...p}
          defaultValue={state.values?.[name] ?? saved ?? ""}
          type="datetime-local"
          required
        />
      )}
    </Field>
  );
}

function CheckboxGroup({
  legend,
  hint,
  name,
  selected,
  onChange,
  options,
}: {
  legend: string;
  hint: string;
  name: string;
  selected: string[];
  onChange: (next: string[]) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-medium">{legend}</legend>
      <p className="-mt-1 text-xs text-muted-foreground">{hint}</p>
      <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
        {options.map((o) => (
          <label key={o.value} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name={name}
              value={o.value}
              checked={selected.includes(o.value)}
              onChange={(e) =>
                onChange(
                  e.target.checked ? [...selected, o.value] : selected.filter((s) => s !== o.value),
                )
              }
              className="mt-0.5 size-4 shrink-0 accent-primary"
            />
            <span className="min-w-0 break-words">{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Uploads as soon as a file is picked and keeps only its link in the form, so
 * a validation error elsewhere can't make the user pick the file again.
 */
function UploadField({
  label,
  name,
  kind,
  accept,
  hint,
  state,
  saved,
}: {
  label: string;
  name: string;
  kind: "poster" | "rules";
  accept: string;
  hint: string;
  state: FormState;
  saved: string;
}) {
  const [url, setUrl] = useState(saved);
  const [error, setError] = useState<string | null>(null);
  const [pending, startUpload] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function upload(file: File) {
    setError(null);
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("Use a file under 3 MB.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    const data = new FormData();
    data.set("kind", kind);
    data.set("file", file);
    startUpload(async () => {
      try {
        const result = await uploadEventFileAction(data);
        if ("url" in result) setUrl(result.url);
        else setError(result.error);
      } catch {
        setError("The upload failed. Try again.");
      }
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  // The upload's own error shows through the same slot as the form's.
  const fieldState: FormState = error ? { ...state, fieldErrors: { [name]: [error] } } : state;

  return (
    <Field label={label} name={name} state={fieldState} hint={hint}>
      {({ id, "aria-invalid": invalid, "aria-describedby": describedBy }) => (
        <div className="grid gap-2">
          <input type="hidden" name={name} value={url} />
          {url && kind === "poster" && (
            <div className="relative aspect-video overflow-hidden rounded-lg border bg-muted">
              <Image src={url} alt="Poster preview" fill sizes="20rem" className="object-cover" />
            </div>
          )}
          {url && kind === "rules" && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm underline underline-offset-4"
            >
              <FileTextIcon className="size-4 shrink-0" aria-hidden /> Current rules PDF
            </a>
          )}
          <Input
            ref={inputRef}
            id={id}
            type="file"
            accept={accept}
            disabled={pending}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
            }}
          />
          {pending && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
              <LoaderCircleIcon className="size-3 animate-spin" aria-hidden /> Uploading…
            </p>
          )}
          {url && !pending && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-fit"
              onClick={() => setUrl("")}
            >
              Remove
            </Button>
          )}
        </div>
      )}
    </Field>
  );
}
