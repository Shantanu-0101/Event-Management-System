import { Suspense } from "react";
import Link from "next/link";
import { CalendarDaysIcon, LogOutIcon, MenuIcon, UserIcon } from "lucide-react";
import { getNavItems } from "@/lib/nav";
import { logoutAction } from "@/server/actions/auth";
import { getCurrentUser, type CurrentUser } from "@/server/session";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/button-link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/theme-toggle";

// The logo and theme switch are static; the menus depend on who is logged
// in, so they stream in behind a Suspense boundary.
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <CalendarDaysIcon className="size-5" aria-hidden />
          <span>Campus Events</span>
        </Link>
        <Suspense
          fallback={
            <div className="ml-auto">
              <ThemeToggle />
            </div>
          }
        >
          <HeaderMenus />
        </Suspense>
      </div>
    </header>
  );
}

async function HeaderMenus() {
  const user = await getCurrentUser();
  const items = getNavItems(user?.role ?? null);

  return (
    <>
      <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
        {items.map((item) => (
          <ButtonLink key={item.href} href={item.href} variant="ghost" size="sm">
            {item.label}
          </ButtonLink>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-1">
        {user ? (
          <AccountMenu user={user} />
        ) : (
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
            {!user && (
              <DropdownMenuItem className="sm:hidden" render={<Link href="/login" />}>
                Log in
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}

const roleLabel = { STUDENT: "Student", COORDINATOR: "Coordinator", ADMIN: "Admin" } as const;

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

function AccountMenu({ user }: { user: CurrentUser }) {
  return (
    <>
      {/* The menu's "Log out" item submits this form. */}
      <form id="logout-form" action={logoutAction} hidden />
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              aria-label="Account menu"
            />
          }
        >
          <Avatar size="sm">
            {user.photoUrl && <AvatarImage src={user.photoUrl} alt="" />}
            <AvatarFallback>{initials(user.name)}</AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="grid gap-1 py-2">
              <span className="truncate font-medium text-foreground">{user.name}</span>
              <span className="truncate font-normal">{user.email}</span>
              <Badge variant="secondary" className="mt-1 w-fit">
                {roleLabel[user.role]}
              </Badge>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link href="/profile" />}>
            <UserIcon /> Profile
          </DropdownMenuItem>
          <DropdownMenuItem render={<button type="submit" form="logout-form" className="w-full" />}>
            <LogOutIcon /> Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
