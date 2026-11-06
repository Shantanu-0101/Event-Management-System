import type { Role } from "@/generated/prisma/enums";

export type NavItem = { href: string; label: string };

// Menu per role (spec section 3). Visitors are people who are not logged in.
const navByRole: Record<Role | "VISITOR", NavItem[]> = {
  VISITOR: [
    { href: "/", label: "Home" },
    { href: "/events", label: "Events" },
  ],
  STUDENT: [
    { href: "/events", label: "Events" },
    { href: "/my-events", label: "My events" },
    { href: "/profile", label: "Profile" },
  ],
  COORDINATOR: [
    { href: "/events", label: "Events" },
    { href: "/manage/events", label: "My events to run" },
    { href: "/manage/check-in", label: "Check-in" },
  ],
  ADMIN: [
    { href: "/events", label: "Events" },
    { href: "/manage/events", label: "Manage events" },
    { href: "/manage/check-in", label: "Check-in" },
    { href: "/manage/users", label: "Users" },
    { href: "/manage/reports", label: "Reports" },
  ],
};

export function getNavItems(role: Role | null): NavItem[] {
  return navByRole[role ?? "VISITOR"];
}
