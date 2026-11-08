"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/button-link";

// Shown when a page fails on the server, for example if the database can't be reached.
// In production Next.js hides the real message, so nothing internal reaches the visitor.
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const digest = error instanceof Error && "digest" in error ? String(error.digest) : null;

  return (
    <div className="mx-auto flex max-w-xl flex-col items-start gap-4 px-4 py-20" role="alert">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground">
        This page couldn&apos;t load. Your data is safe. Try again, and if it keeps happening, tell
        the event cell.
      </p>
      {digest && <p className="text-sm text-muted-foreground">Reference: {digest}</p>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => retry()}>Try again</Button>
        <ButtonLink href="/" variant="outline">
          Back to home
        </ButtonLink>
      </div>
    </div>
  );
}
