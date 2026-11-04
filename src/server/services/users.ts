import bcrypt from "bcryptjs";
import type { Prisma } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { appUrl, linkEmail, sendEmail } from "@/lib/email";
import { consumeToken, issueToken } from "@/server/services/auth-tokens";

// Account rules (spec M1). Server actions validate input and check roles,
// then call these.

export class UserRuleError extends Error {
  constructor(
    message: string,
    public field?: string,
  ) {
    super(message);
  }
}

const BCRYPT_COST = 12;

export async function createStudent(input: {
  name: string;
  email: string;
  rollNo: string;
  departmentId: string;
  year: number;
  password: string;
}) {
  const [emailTaken, rollTaken, department] = await Promise.all([
    prisma.user.findUnique({ where: { email: input.email }, select: { id: true } }),
    prisma.user.findUnique({ where: { rollNo: input.rollNo }, select: { id: true } }),
    prisma.department.findUnique({ where: { id: input.departmentId }, select: { id: true } }),
  ]);
  if (emailTaken) throw new UserRuleError("An account with this email already exists.", "email");
  if (rollTaken) throw new UserRuleError("This roll number is already registered.", "rollNo");
  if (!department) throw new UserRuleError("Choose your department.", "departmentId");

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      rollNo: input.rollNo,
      departmentId: input.departmentId,
      year: input.year,
      passwordHash: await bcrypt.hash(input.password, BCRYPT_COST),
    },
  });
  await sendVerificationEmail(user.id);
  return user;
}

export async function sendVerificationEmail(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.emailVerifiedAt) return;

  const token = await issueToken(user.id, "VERIFY_EMAIL");
  await sendEmail(
    linkEmail({
      to: user.email,
      subject: "Verify your email for Campus Events",
      greeting: `Hi ${user.name},`,
      body: "Confirm this is your email address to finish setting up your account.",
      buttonText: "Verify email",
      url: appUrl(`/verify-email?token=${token}`),
      footer: "The link works for 24 hours. If you didn't sign up, ignore this email.",
    }),
  );
}

/** Returns true when the link was valid and the email is now verified. */
export async function verifyEmail(token: string): Promise<boolean> {
  const userId = await consumeToken(token, "VERIFY_EMAIL");
  if (!userId) return false;
  await prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  return true;
}

/** Sends a reset link if the email has an active account; silent otherwise. */
export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) return;

  const token = await issueToken(user.id, "RESET_PASSWORD");
  await sendEmail(
    linkEmail({
      to: user.email,
      subject: "Reset your Campus Events password",
      greeting: `Hi ${user.name},`,
      body: "Someone asked to reset the password for this account. Choose a new one with the button below.",
      buttonText: "Choose a new password",
      url: appUrl(`/reset-password?token=${token}`),
      footer: "The link works for 1 hour. If you didn't ask for this, ignore this email.",
    }),
  );
}

/**
 * Sets a new password from a reset link. Clicking the emailed link also
 * proves the address, and every existing login is signed out.
 */
export async function resetPassword(token: string, password: string): Promise<boolean> {
  const userId = await consumeToken(token, "RESET_PASSWORD");
  if (!userId) return false;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: await bcrypt.hash(password, BCRYPT_COST),
      sessionVersion: { increment: 1 },
      emailVerifiedAt: user?.emailVerifiedAt ?? new Date(),
    },
  });
  return true;
}

export async function updateProfile(
  userId: string,
  input: {
    name: string;
    phone?: string;
    year?: number;
    rollNo?: string;
    departmentId?: string;
    photoUrl?: string;
  },
) {
  const current = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const data: Prisma.UserUpdateInput = {
    name: input.name,
    phone: input.phone ?? null,
    year: input.year ?? null,
  };
  if (input.photoUrl) data.photoUrl = input.photoUrl;

  // Roll number and department are set once; later changes go through an admin.
  if (!current.rollNo && input.rollNo) {
    const taken = await prisma.user.findUnique({ where: { rollNo: input.rollNo } });
    if (taken) throw new UserRuleError("This roll number is already registered.", "rollNo");
    data.rollNo = input.rollNo;
  }
  if (!current.departmentId && input.departmentId) {
    data.department = { connect: { id: input.departmentId } };
  }

  return prisma.user.update({ where: { id: userId }, data });
}

// ─── Admin ──────────────────────────────────────────────────────────────────

export const USERS_PAGE_SIZE = 20;

export async function listUsers(opts: { q?: string; role?: Role; page: number }) {
  const q = opts.q?.trim();
  const where: Prisma.UserWhereInput = {
    ...(opts.role ? { role: opts.role } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { rollNo: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      skip: (opts.page - 1) * USERS_PAGE_SIZE,
      take: USERS_PAGE_SIZE,
      select: {
        id: true,
        name: true,
        email: true,
        rollNo: true,
        year: true,
        role: true,
        isActive: true,
        emailVerifiedAt: true,
        department: { select: { code: true } },
      },
    }),
  ]);
  return { total, users, pages: Math.max(1, Math.ceil(total / USERS_PAGE_SIZE)) };
}

/** Stops admins from locking everyone out by removing the last admin. */
async function assertNotLastAdmin(userId: string) {
  const target = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (target.role !== "ADMIN" || !target.isActive) return target;
  const admins = await prisma.user.count({ where: { role: "ADMIN", isActive: true } });
  if (admins <= 1) throw new UserRuleError("There must be at least one active admin.");
  return target;
}

// Both changes bump sessionVersion, so the user is signed out and their next
// login carries the new role.

export async function changeRole(actorId: string, userId: string, role: Role) {
  if (actorId === userId) throw new UserRuleError("You can't change your own role.");
  const target = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (target.role === role) return;
  if (role !== "ADMIN") await assertNotLastAdmin(userId);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { role, sessionVersion: { increment: 1 } },
    }),
    prisma.auditLog.create({
      data: {
        actorId,
        action: "user.role_changed",
        entity: "user",
        entityId: userId,
        meta: { from: target.role, to: role },
      },
    }),
  ]);
}

export async function setActive(actorId: string, userId: string, isActive: boolean) {
  if (actorId === userId) throw new UserRuleError("You can't deactivate your own account.");
  if (!isActive) await assertNotLastAdmin(userId);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { isActive, sessionVersion: { increment: 1 } },
    }),
    prisma.auditLog.create({
      data: {
        actorId,
        action: isActive ? "user.activated" : "user.deactivated",
        entity: "user",
        entityId: userId,
      },
    }),
  ]);
}
