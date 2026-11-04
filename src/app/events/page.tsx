import { Suspense } from "react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { connection } from "next/server";
import { SearchIcon } from "lucide-react";
import { parseEventFilters, type PublicEventFilters } from "@/lib/event-schema";
import { cn } from "@/lib/utils";
import { getEventFilterOptions, listPublicEvents } from "@/server/services/events";
import { ButtonLink } from "@/components/button-link";
import { EventCard } from "@/components/event-card";
import { NativeSelect } from "@/components/form";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Events",
  description: "Browse college events: sports, cultural, technical and more.",
};

export default function EventsPage({ searchParams }: PageProps<"/events">) {
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold">Events</h1>
        <p className="text-sm text-muted-foreground">
          Find what&apos;s on at college, and what you can join.
        </p>
      </div>
      <Suspense fallback={<EventsSkeleton />}>
        <EventsContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function hrefFor(
  f: PublicEventFilters,
  changes: Partial<Pick<PublicEventFilters, "tab" | "page">>,
) {
  const tab = changes.tab ?? f.tab;
  const page = changes.page ?? 1;
  const sp = new URLSearchParams();
  if (tab === "past") sp.set("tab", "past");
  if (f.q) sp.set("q", f.q);
  if (f.category) sp.set("category", f.category);
  if (f.department) sp.set("department", f.department);
  if (f.from) sp.set("from", f.from);
  if (f.to) sp.set("to", f.to);
  // The default order differs per tab, so only a chosen order on the same tab carries over.
  if (tab === f.tab && f.sort !== (tab === "past" ? "desc" : "asc")) sp.set("sort", f.sort);
  if (page > 1) sp.set("page", String(page));
  const s = sp.toString();
  return s ? `/events?${s}` : "/events";
}

async function EventsContent({ searchParams }: Pick<PageProps<"/events">, "searchParams">) {
  await connection();
  const f = parseEventFilters(await searchParams);
  const now = new Date();
  const [{ events, total, pages, page }, options] = await Promise.all([
    listPublicEvents(f, now),
    getEventFilterOptions(),
  ]);
  const filterCount = [f.category, f.department, f.from, f.to].filter(Boolean).length;
  const filtered = Boolean(f.q) || filterCount > 0;

  return (
    <>
      <nav aria-label="When" className="-mx-1 flex gap-1 border-b">
        {(["upcoming", "past"] as const).map((tab) => (
          <Link
            key={tab}
            href={hrefFor(f, { tab })}
            aria-current={tab === f.tab ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm text-muted-foreground capitalize hover:text-foreground",
              tab === f.tab
                ? "border-foreground font-medium text-foreground"
                : "border-transparent",
            )}
          >
            {tab}
          </Link>
        ))}
      </nav>

      <Form action="/events" role="search" className="grid gap-3" key={JSON.stringify(f)}>
        {f.tab === "past" && <input type="hidden" name="tab" value="past" />}
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <SearchIcon className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground" />
            <Input
              name="q"
              type="search"
              defaultValue={f.q}
              placeholder="Search events, categories or venues"
              aria-label="Search events"
              className="pl-8"
            />
          </div>
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </div>
        {/* Folded by default so results start on a phone's first screen. */}
        <details open={filterCount > 0} className="group">
          <summary className="w-fit cursor-pointer text-sm font-medium">
            Filters{filterCount > 0 && ` (${filterCount})`}
          </summary>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
            <div className="grid gap-1.5">
              <Label htmlFor="filter-category">Category</Label>
              <NativeSelect id="filter-category" name="category" defaultValue={f.category}>
                <option value="">All</option>
                {options.categories.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="filter-department">Open to</Label>
              <NativeSelect id="filter-department" name="department" defaultValue={f.department}>
                <option value="">All departments</option>
                {options.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="filter-from">From</Label>
              <Input id="filter-from" name="from" type="date" defaultValue={f.from} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="filter-to">To</Label>
              <Input id="filter-to" name="to" type="date" defaultValue={f.to} />
            </div>
            <div className="col-span-2 grid gap-1.5 md:col-span-1">
              <Label htmlFor="filter-sort">Sort by date</Label>
              <NativeSelect id="filter-sort" name="sort" defaultValue={f.sort}>
                <option value="asc">Soonest first</option>
                <option value="desc">Latest first</option>
              </NativeSelect>
            </div>
          </div>
          <Button type="submit" variant="secondary" className="mt-3">
            Apply filters
          </Button>
        </details>
        {filtered && (
          <ButtonLink
            href={f.tab === "past" ? "/events?tab=past" : "/events"}
            variant="ghost"
            size="sm"
            className="w-fit"
          >
            Clear search and filters
          </ButtonLink>
        )}
      </Form>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {total === 0
          ? filtered
            ? "No events match your search. Try fewer filters."
            : f.tab === "past"
              ? "No past events yet."
              : "No upcoming events right now. Check back soon."
          : `${total} event${total === 1 ? "" : "s"}`}
      </p>

      {events.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event, i) => (
            <li key={event.id} className="relative">
              <EventCard event={event} now={now} priority={i === 0} />
            </li>
          ))}
        </ul>
      )}

      <Pagination page={page} pages={pages} href={(p) => hrefFor(f, { page: p })} />
    </>
  );
}

function EventsSkeleton() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Loading events">
      <Skeleton className="h-9 rounded-lg" />
      <Skeleton className="h-28 rounded-lg" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-72 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
