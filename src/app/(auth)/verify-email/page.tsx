import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { CircleCheckIcon, CircleXIcon } from "lucide-react";
import { ButtonLink } from "@/components/button-link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { verifyEmail } from "@/server/services/users";

export const metadata: Metadata = { title: "Verify email" };

export default function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  return (
    <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
      <VerifyEmailContent searchParams={searchParams} />
    </Suspense>
  );
}

// Opened from the link in the verification email. Verifying on page load is
// safe here: the token is single-use and only marks the email as verified.
async function VerifyEmailContent({
  searchParams,
}: Pick<PageProps<"/verify-email">, "searchParams">) {
  // Token checks compare against the current time, so run per request.
  await connection();
  const { token } = await searchParams;
  const ok = typeof token === "string" && (await verifyEmail(token));

  return (
    <Card>
      <CardHeader>
        <div className="mb-2">
          {ok ? (
            <CircleCheckIcon className="size-8 text-emerald-600" aria-hidden />
          ) : (
            <CircleXIcon className="size-8 text-destructive" aria-hidden />
          )}
        </div>
        <CardTitle className="text-xl">
          {ok ? "Email verified" : "This link no longer works"}
        </CardTitle>
        <CardDescription>
          {ok
            ? "Thanks! You can now register for events."
            : "Verification links work once, for 24 hours. Log in and use “Send a new link” in the yellow banner."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ButtonLink href="/" className="w-full">
          Go to Campus Events
        </ButtonLink>
      </CardContent>
    </Card>
  );
}
