import type { Role } from "@/generated/prisma/enums";

export const ALL_ROLES: readonly Role[] = ["STUDENT", "COORDINATOR", "ADMIN"];
export const STAFF_ROLES: readonly Role[] = ["COORDINATOR", "ADMIN"];
export const ADMIN_ONLY: readonly Role[] = ["ADMIN"];

// Who may open which pages (spec section 3). The first matching prefix wins,
// so list longer prefixes first. Paths not listed are public.
// The proxy uses this for a fast redirect or 403; every page and server
// action still checks the role itself with requireRole().
const rules: { prefix: string; roles: readonly Role[] }[] = [
  { prefix: "/manage/users", roles: ADMIN_ONLY },
  { prefix: "/manage/departments", roles: ADMIN_ONLY },
  { prefix: "/manage/categories", roles: ADMIN_ONLY },
  { prefix: "/manage/venues", roles: ADMIN_ONLY },
  { prefix: "/manage/reports", roles: ADMIN_ONLY },
  { prefix: "/manage/events/new", roles: ADMIN_ONLY },
  { prefix: "/manage", roles: STAFF_ROLES },
  { prefix: "/profile", roles: ALL_ROLES },
  { prefix: "/my-events", roles: ALL_ROLES },
];

// Pages for signed-out people only; signed-in users are sent home.
export const GUEST_ONLY_PATHS = ["/login", "/signup", "/forgot-password", "/reset-password"];

function matches(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Roles allowed on a path, or null when the path is public. */
export function allowedRoles(pathname: string): readonly Role[] | null {
  return rules.find((r) => matches(pathname, r.prefix))?.roles ?? null;
}

export function isGuestOnly(pathname: string) {
  return GUEST_ONLY_PATHS.some((p) => matches(pathname, p));
}

/** A same-site path to return to after login; anything else falls back to "/". */
export function safeNextPath(next: unknown): string {
  // "//host" and "/\host" are read by browsers as links to another site.
  if (typeof next !== "string" || !/^\/(?![/\\])/.test(next)) return "/";
  if (next.startsWith("/api/") || isGuestOnly(next)) return "/";
  return next;
}
