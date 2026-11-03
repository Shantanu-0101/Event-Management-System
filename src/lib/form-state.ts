import { z } from "zod";

/** What a form's server action returns to useActionState. */
export type FormState = {
  ok?: boolean;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  // What the user typed, so the form can show it again after an error.
  values?: Record<string, string>;
};

export const initialFormState: FormState = {};

const NEVER_ECHO = ["password", "confirmPassword", "token"];

/** Text fields from the form, minus passwords, for re-filling inputs. */
export function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData) {
    if (typeof value === "string" && !key.startsWith("$") && !NEVER_ECHO.includes(key)) {
      values[key] = value;
    }
  }
  return values;
}

export function invalid(error: z.ZodError, formData: FormData): FormState {
  return {
    message: "Please fix the highlighted fields.",
    fieldErrors: z.flattenError(error).fieldErrors as FormState["fieldErrors"],
    values: formValues(formData),
  };
}

export function failed(message: string, formData?: FormData, field?: string): FormState {
  return {
    // A field's error shows under the field; the top box just points to it.
    message: field ? "Please fix the highlighted fields." : message,
    fieldErrors: field ? { [field]: [message] } : undefined,
    values: formData ? formValues(formData) : undefined,
  };
}
