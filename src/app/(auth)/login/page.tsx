import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/access";
import { googleEnabled } from "@/server/auth";
import { getCurrentUser } from "@/server/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

const notices: Record<string, string> = {
  domain: "Google sign-in only accepts college email addresses.",
  inactive: "This account has been deactivated. Contact the event cell.",
  OAuthAccountNotLinked: "Log in with your password; this email already has an account.",
};

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">
          <h1>Log in</h1>
        </CardTitle>
        <CardDescription>Use the email and password you signed up with.</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<Skeleton className="h-56" />}>
          <LoginContent searchParams={searchParams} />
        </Suspense>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          New here?{" "}
          <Link href="/signup" className="font-medium text-foreground underline underline-offset-4">
            Create an account
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

async function LoginContent({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  if (await getCurrentUser()) redirect("/");
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;

  return (
    <LoginForm
      next={safeNextPath(params.next)}
      googleEnabled={googleEnabled}
      notice={
        params.reset
          ? { ok: true, text: "Password changed. Log in with the new one." }
          : error
            ? { ok: false, text: notices[error] ?? "Sign-in failed. Try again." }
            : undefined
      }
    />
  );
}
