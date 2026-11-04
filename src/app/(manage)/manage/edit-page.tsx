import { ChevronLeftIcon } from "lucide-react";
import { ButtonLink } from "@/components/button-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Frame for the admin's edit pages: a back link and the form in a card. */
export function EditPage({
  backHref,
  backLabel,
  title,
  children,
}: {
  backHref: string;
  backLabel: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto grid max-w-2xl gap-4 px-4 py-10">
      <ButtonLink href={backHref} variant="ghost" size="sm" className="w-fit">
        <ChevronLeftIcon data-icon="inline-start" /> {backLabel}
      </ButtonLink>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{title}</CardTitle>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}
