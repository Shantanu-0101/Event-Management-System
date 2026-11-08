import { Suspense } from "react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { BadgeCheckIcon, CircleXIcon } from "lucide-react";
import { CERTIFICATE_LABELS } from "@/lib/certificates";
import { formatDate } from "@/lib/time";
import { findCertificateByCode } from "@/server/services/certificates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

// Anyone can open this, from a certificate's QR code or by typing its code. It names
// people, so search engines are asked to stay away.
export const metadata: Metadata = {
  title: "Verify a certificate",
  robots: { index: false, follow: false },
};

type Props = PageProps<"/certificates/verify">;

export default function VerifyPage({ searchParams }: Props) {
  return (
    <div className="mx-auto grid max-w-lg grid-cols-[minmax(0,1fr)] gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold">Verify a certificate</h1>
        <p className="text-sm text-muted-foreground">
          Scan the QR code on a certificate, or type the code printed under it.
        </p>
      </div>
      <Suspense fallback={<Skeleton className="h-48 rounded-xl" />}>
        <VerifyContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function VerifyContent({ searchParams }: Pick<Props, "searchParams">) {
  const { code } = await searchParams;
  const typed = typeof code === "string" ? code.trim().slice(0, 40) : "";

  return (
    <>
      <Form action="/certificates/verify" className="flex gap-2" role="search">
        <Input
          name="code"
          defaultValue={typed}
          required
          placeholder="Certificate code"
          aria-label="Certificate code"
          autoCapitalize="characters"
          autoComplete="off"
          className="flex-1 font-mono"
        />
        <Button type="submit">Check</Button>
      </Form>
      {typed && <VerifyResult code={typed} />}
    </>
  );
}

async function VerifyResult({ code }: { code: string }) {
  const certificate = await findCertificateByCode(code);

  if (!certificate) {
    return (
      <section aria-live="polite" className="flex gap-3 rounded-xl border p-4">
        <CircleXIcon className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
        <div className="grid gap-1 text-sm">
          <h2 className="font-semibold">Not a valid certificate</h2>
          <p className="text-muted-foreground">
            We have no certificate with this code. Check it for typing mistakes. A certificate can
            also be withdrawn if the event&apos;s records were corrected.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section aria-live="polite" className="grid gap-4 rounded-xl border p-4">
      <div className="flex items-center gap-2">
        <BadgeCheckIcon className="size-5 shrink-0 text-primary" aria-hidden />
        <h2 className="font-semibold">Valid certificate</h2>
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">Issued to</dt>
        <dd className="font-medium break-words">{certificate.name}</dd>
        {certificate.team && (
          <>
            <dt className="text-muted-foreground">Team</dt>
            <dd className="break-words">{certificate.team}</dd>
          </>
        )}
        <dt className="text-muted-foreground">Type</dt>
        <dd>
          {CERTIFICATE_LABELS[certificate.type]}
          {certificate.type === "MERIT" && certificate.place && ` (${certificate.place} place)`}
        </dd>
        <dt className="text-muted-foreground">Event</dt>
        <dd className="break-words">
          <Link href={`/events/${certificate.eventSlug}`} className="underline underline-offset-4">
            {certificate.eventTitle}
          </Link>
          {certificate.subEvent && (
            <span className="block text-muted-foreground">{certificate.subEvent}</span>
          )}
        </dd>
        <dt className="text-muted-foreground">Held</dt>
        <dd>{certificate.dates}</dd>
        <dt className="text-muted-foreground">Issued on</dt>
        <dd>{formatDate(certificate.issuedAt)}</dd>
      </dl>
    </section>
  );
}
