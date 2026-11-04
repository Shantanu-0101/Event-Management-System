import { createHash, randomBytes } from "node:crypto";
import type { AuthTokenType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

const LIFETIME_MS: Record<AuthTokenType, number> = {
  VERIFY_EMAIL: 24 * 60 * 60 * 1000,
  RESET_PASSWORD: 60 * 60 * 1000,
};

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * Makes a one-time link token for the user and returns it in plain form
 * (for the email). Earlier unused tokens of the same type stop working.
 */
export async function issueToken(userId: string, type: AuthTokenType): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await prisma.$transaction([
    prisma.authToken.deleteMany({ where: { userId, type, usedAt: null } }),
    prisma.authToken.create({
      data: {
        userId,
        type,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + LIFETIME_MS[type]),
      },
    }),
  ]);
  return token;
}

/**
 * Marks the token used and returns its user id, or null when the token is
 * unknown, expired or already used. The conditional update makes a second
 * click on the same link fail even if both arrive at once.
 */
export async function consumeToken(token: string, type: AuthTokenType): Promise<string | null> {
  const tokenHash = hashToken(token);
  const { count } = await prisma.authToken.updateMany({
    where: { tokenHash, type, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  if (count === 0) return null;

  const row = await prisma.authToken.findUnique({ where: { tokenHash }, select: { userId: true } });
  return row?.userId ?? null;
}

/** True when the token could still be used (for showing the reset form). */
export async function isTokenUsable(token: string, type: AuthTokenType): Promise<boolean> {
  const row = await prisma.authToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { type: true, usedAt: true, expiresAt: true },
  });
  return !!row && row.type === type && !row.usedAt && row.expiresAt > new Date();
}
