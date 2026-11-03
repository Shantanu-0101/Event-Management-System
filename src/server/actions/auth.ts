"use server";

import { AuthError, CredentialsSignin } from "next-auth";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/access";
import { failed, formValues, invalid, type FormState } from "@/lib/form-state";
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
} from "@/lib/schemas";
import { signIn, signOut } from "@/server/auth";
import { getCurrentUser } from "@/server/session";
import {
  createStudent,
  requestPasswordReset,
  resetPassword,
  sendVerificationEmail,
  UserRuleError,
} from "@/server/services/users";

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);

  try {
    await signIn("credentials", {
      ...parsed.data,
      redirectTo: safeNextPath(formData.get("next")),
    });
  } catch (e) {
    // signIn() ends with a redirect, which is thrown; let it through.
    if (e instanceof CredentialsSignin && e.code === "inactive") {
      return failed("This account has been deactivated. Contact the event cell.", formData);
    }
    if (e instanceof AuthError) return failed("Wrong email or password.", formData);
    throw e;
  }
  return {};
}

export async function googleSignInAction(formData: FormData) {
  await signIn("google", { redirectTo: safeNextPath(formData.get("next")) });
}

export async function signupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);

  try {
    await createStudent(parsed.data);
  } catch (e) {
    if (e instanceof UserRuleError) return failed(e.message, formData, e.field);
    throw e;
  }

  // Sign the new student straight in; the verify-email banner stays until
  // they click the emailed link.
  await signIn("credentials", {
    email: parsed.data.email,
    password: parsed.data.password,
    redirectTo: "/profile?welcome=1",
  });
  return {};
}

export async function logoutAction() {
  await signOut({ redirectTo: "/" });
}

export async function resendVerificationAction(): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.emailVerified) return { ok: true, message: "Your email is already verified." };
  await sendVerificationEmail(user.id);
  return { ok: true, message: `We sent a new link to ${user.email}.` };
}

export async function forgotPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = forgotPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);

  await requestPasswordReset(parsed.data.email);
  // Same answer whether or not the account exists, so the form can't be used
  // to find out who has an account.
  return {
    ok: true,
    message: "If that email has an account, a reset link is on its way. It works for 1 hour.",
    values: formValues(formData),
  };
}

export async function resetPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = resetPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);

  const ok = await resetPassword(parsed.data.token, parsed.data.password);
  if (!ok) return failed("This link has expired or was already used. Ask for a new one.");
  redirect("/login?reset=1");
}
