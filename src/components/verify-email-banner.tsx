import { getCurrentUser } from "@/server/session";
import { ResendVerificationButton } from "@/components/resend-verification-button";

/** A strip under the header until the signed-in user verifies their email. */
export async function VerifyEmailBanner() {
  const user = await getCurrentUser();
  if (!user || user.emailVerified) return null;

  return (
    <div className="border-b border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-sm">
        <p>
          Verify your email to register for events. We sent a link to{" "}
          <span className="font-medium">{user.email}</span>.
        </p>
        <ResendVerificationButton />
      </div>
    </div>
  );
}
