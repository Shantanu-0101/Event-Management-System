import { ButtonLink } from "@/components/button-link";

/** Previous and next links for a long list. Shows nothing for a single page. */
export function Pagination({
  page,
  pages,
  href,
}: {
  page: number;
  pages: number;
  href: (page: number) => string;
}) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pages" className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">
        Page {page} of {pages}
      </span>
      <div className="flex gap-2">
        {page > 1 && (
          <ButtonLink href={href(page - 1)} variant="outline" size="sm">
            Previous
          </ButtonLink>
        )}
        {page < pages && (
          <ButtonLink href={href(page + 1)} variant="outline" size="sm">
            Next
          </ButtonLink>
        )}
      </div>
    </nav>
  );
}
