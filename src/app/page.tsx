import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowRightIcon } from "lucide-react";
import { getActiveCategories } from "@/server/services/categories";
import { CategoryIcon } from "@/components/category-icon";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/button-link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl px-4">
      <section className="py-14 sm:py-20">
        <h1 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-5xl">
          Every college event, one place to register.
        </h1>
        <p className="mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
          Browse sports, cultural and technical events, sign up solo or with your team, and check in
          with a QR ticket on the day.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/events" size="lg">
            Browse events <ArrowRightIcon data-icon="inline-end" />
          </ButtonLink>
          <ButtonLink href="/signup" size="lg" variant="outline">
            Create an account
          </ButtonLink>
        </div>
      </section>

      <section aria-labelledby="categories-heading" className="pb-16">
        <h2 id="categories-heading" className="text-xl font-semibold">
          Categories
        </h2>
        <Suspense fallback={<CategoryGridSkeleton />}>
          <CategoryGrid />
        </Suspense>
      </section>
    </div>
  );
}

// Read at request time so admins' changes show at once and builds don't need
// a database connection.
async function CategoryGrid() {
  await connection();
  const categories = await getActiveCategories(new Date());

  if (categories.length === 0) {
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        No categories yet. An admin can add them once the admin pages are ready.
      </p>
    );
  }

  return (
    <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {categories.map((c) => (
        <li key={c.id} className="relative">
          <Card className="h-full transition-shadow focus-within:ring-2 focus-within:ring-ring hover:shadow-md">
            <CardHeader>
              <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-muted">
                <CategoryIcon name={c.icon} className="size-5" />
              </div>
              <CardTitle>
                {/* The whole card is clickable through this one link. */}
                <Link
                  href={`/events?category=${c.slug}`}
                  className="outline-none after:absolute after:inset-0"
                >
                  {c.name}
                </Link>
              </CardTitle>
              {c.description && <CardDescription>{c.description}</CardDescription>}
              <div className="pt-2">
                <Badge variant="secondary">
                  {c.upcomingEvents === 0
                    ? "No upcoming events"
                    : `${c.upcomingEvents} upcoming event${c.upcomingEvents === 1 ? "" : "s"}`}
                </Badge>
              </div>
            </CardHeader>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function CategoryGridSkeleton() {
  return (
    <ul
      className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      aria-busy="true"
      aria-label="Loading categories"
    >
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className="h-40 animate-pulse rounded-xl bg-muted" />
      ))}
    </ul>
  );
}
