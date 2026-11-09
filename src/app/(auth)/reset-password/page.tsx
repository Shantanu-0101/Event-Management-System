import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { ButtonLink } from "@/components/button-link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { isTokenUsable } from "@/server/services/auth-tokens";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  return (
    <Suspense fallback={<Skeleton className="h-80 rounded-xl" />}>
      <ResetPasswordContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ResetPasswordContent({
  searchParams,
}: Pick<PageProps<"/reset-password">, "searchParams">) {
  // Token checks compare against the current time, so run per request.
  await connection();
  const { token } = await searchParams;
  const usable = typeof token === "string" && (await isTokenUsable(token, "RESET_PASSWORD"));

  if (!usable) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            <h1>This link no longer works</h1>
          </CardTitle>
          <CardDescription>
            Reset links work once, for 1 hour. Ask for a new one and use the latest email.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ButtonLink href="/forgot-password" className="w-full">
            Send a new link
          </ButtonLink>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">
          <h1>Choose a new password</h1>
        </CardTitle>
        <CardDescription>You&apos;ll be logged out on every other device.</CardDescription>
      </CardHeader>
      <CardContent>
        <ResetPasswordForm token={token} />
      </CardContent>
    </Card>
  );
}
