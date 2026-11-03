import { ButtonLink } from "@/components/button-link";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-start gap-4 px-4 py-20">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground">
        This page doesn&apos;t exist, or it hasn&apos;t been built yet.
      </p>
      <ButtonLink href="/">Back to home</ButtonLink>
    </div>
  );
}
