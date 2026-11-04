import Link from "next/link";
import { CalendarDaysIcon, MenuIcon } from "lucide-react";
import type { Role } from "@/generated/prisma/enums";
import { getNavItems } from "@/lib/nav";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/button-link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/theme-toggle";

export function SiteHeader({ role }: { role: Role | null }) {
  const items = getNavItems(role);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <CalendarDaysIcon className="size-5" aria-hidden />
          <span>Campus Events</span>
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {items.map((item) => (
            <ButtonLink key={item.href} href={item.href} variant="ghost" size="sm">
              {item.label}
            </ButtonLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          {role === null && (
            <>
              <ButtonLink href="/login" variant="ghost" size="sm" className="hidden sm:inline-flex">
                Log in
              </ButtonLink>
              <ButtonLink href="/signup" size="sm">
                Sign up
              </ButtonLink>
            </>
          )}
          <ThemeToggle />

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu" />
              }
            >
              <MenuIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {items.map((item) => (
                <DropdownMenuItem key={item.href} render={<Link href={item.href} />}>
                  {item.label}
                </DropdownMenuItem>
              ))}
              {role === null && (
                <DropdownMenuItem className="sm:hidden" render={<Link href="/login" />}>
                  Log in
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
