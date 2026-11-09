import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-x-4 gap-y-1 px-4 py-6 text-sm text-muted-foreground">
        <span>CSMSS Events · college event registration and check-in</span>
        <Link href="/certificates/verify" className="underline-offset-4 hover:underline">
          Verify a certificate
        </Link>
      </div>
    </footer>
  );
}
