import Link from "next/link";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/manage/events", label: "Events" },
  { href: "/manage/users", label: "Users" },
  { href: "/manage/departments", label: "Departments" },
  { href: "/manage/categories", label: "Categories" },
  { href: "/manage/venues", label: "Venues" },
];

/** Page title plus links between the admin's user and master-data pages. */
export function AdminHeader({
  current,
  title,
  description,
}: {
  current: string;
  title: string;
  description: string;
}) {
  return (
    <div className="grid gap-4">
      <nav aria-label="Admin sections" className="-mx-1 flex gap-1 overflow-x-auto border-b">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={t.href === current ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap text-muted-foreground hover:text-foreground",
              t.href === current
                ? "border-foreground font-medium text-foreground"
                : "border-transparent",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
