import { ButtonLink } from "@/components/button-link";

// Shown by forbidden() (requireRole) and, with HTTP 403, by the proxy
// through the /403 page.
export default function Forbidden() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-start gap-4 px-4 py-20">
      <p className="text-sm font-medium text-muted-foreground">Error 403</p>
      <h1 className="text-2xl font-semibold">You don&apos;t have access to this page</h1>
      <p className="text-muted-foreground">
        It&apos;s for another role. If your role was changed recently, log out and log in again.
      </p>
      <ButtonLink href="/">Back to home</ButtonLink>
    </div>
  );
}
