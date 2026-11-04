import { cache } from "react";
import { forbidden, redirect } from "next/navigation";
import { connection } from "next/server";
import type { Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { auth } from "@/server/auth";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  rollNo: string | null;
  departmentId: string | null;
  year: number | null;
  phone: string | null;
  photoUrl: string | null;
  emailVerified: boolean;
  hasPassword: boolean;
};

/**
 * The signed-in user, read fresh from the database, or null.
 * A login cookie stops counting when the account is deactivated or its
 * sessionVersion has moved on (role change, password reset).
 * Cached per request, so calling it from many components costs one query.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  // Mark this as request-time work before Auth.js runs: it calls
  // crypto.randomUUID() during setup, which Next.js refuses in prerenders.
  await connection();
  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || !user.isActive || user.sessionVersion !== session.user.sv) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    rollNo: user.rollNo,
    departmentId: user.departmentId,
    year: user.year,
    phone: user.phone,
    photoUrl: user.photoUrl,
    emailVerified: user.emailVerifiedAt !== null,
    hasPassword: user.passwordHash !== null,
  };
});

/** The signed-in user; sends everyone else to the login page. */
export async function requireUser(nextPath?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login");
  return user;
}

/**
 * Use at the top of every protected page, server action and route handler.
 * Signed out → login page. Signed in with another role → 403.
 */
export async function requireRole(roles: readonly Role[], nextPath?: string) {
  const user = await requireUser(nextPath);
  if (!roles.includes(user.role)) forbidden();
  return user;
}
