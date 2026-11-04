"use client";

import { useEffect, useId, useRef } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { CircleAlertIcon, CircleCheckIcon, LoaderCircleIcon } from "lucide-react";
import type { FormState } from "@/lib/form-state";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

// Small building blocks shared by every form. Forms post to server actions
// through useActionState; these read the returned FormState.

/** A label, one input and its error message, wired together for screen readers. */
export function Field({
  label,
  name,
  state,
  hint,
  className,
  children,
}: {
  label: string;
  name: string;
  state: FormState;
  hint?: string;
  className?: string;
  children: (props: {
    id: string;
    name: string;
    "aria-invalid": boolean | undefined;
    "aria-describedby": string | undefined;
    defaultValue: string | undefined;
  }) => React.ReactNode;
}) {
  const id = useId();
  const error = state.fieldErrors?.[name]?.[0];
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ");

  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children({
        id,
        name,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy || undefined,
        defaultValue: state.values?.[name],
      })}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** The form-level message: an error box, or a success box when ok is set. */
export function FormMessage({ state }: { state: FormState }) {
  if (!state.message) return null;
  return (
    <Alert variant={state.ok ? "default" : "destructive"} aria-live="polite">
      {state.ok ? <CircleCheckIcon /> : <CircleAlertIcon />}
      <AlertDescription className={state.ok ? "text-foreground" : undefined}>
        {state.message}
      </AlertDescription>
    </Alert>
  );
}

/** Shows a toast once per returned state, for small inline forms. */
export function useStateToast(state: FormState) {
  const last = useRef<FormState | null>(null);
  useEffect(() => {
    if (state === last.current || !state.message) return;
    last.current = state;
    if (state.ok) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);
}

export function SubmitButton({
  children,
  className,
  variant,
  size,
  pending: pendingProp,
}: {
  children: React.ReactNode;
  className?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  /** For forms that submit by hand, which useFormStatus can't see. */
  pending?: boolean;
}) {
  const status = useFormStatus();
  const pending = pendingProp || status.pending;
  return (
    <Button type="submit" disabled={pending} className={className} variant={variant} size={size}>
      {pending && <LoaderCircleIcon className="animate-spin" aria-hidden />}
      {children}
    </Button>
  );
}

const selectClass =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 [&>option]:bg-popover [&>option]:text-popover-foreground";

/** The browser's own <select>, styled like Input. Works well on phones. */
export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return <select className={cn(selectClass, className)} {...props} />;
}
