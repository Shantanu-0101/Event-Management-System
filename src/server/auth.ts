import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { clientAddress } from "@/lib/rate-limits";
import { loginSchema } from "@/lib/schemas";
import { authConfig } from "@/server/auth.config";
import { clearRateLimit, hitRateLimit } from "@/server/services/rate-limit";

// Google sign-in is optional (spec M1). It turns on only when the Google
// keys AND the college email domain are set, so it can never let in an
// outside address.
const collegeDomain = process.env.ALLOWED_EMAIL_DOMAIN?.trim().toLowerCase() || null;
export const googleEnabled = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET && collegeDomain,
);

class InactiveAccount extends CredentialsSignin {
  code = "inactive";
}

class TooManyAttempts extends CredentialsSignin {
  code = "rate_limited";
}

// Same cost as a real check, so response time doesn't reveal whether an
// email has an account.
const DUMMY_HASH = "$2b$12$LWyXLdnIEtl86w0ONV87vusSYofN2DIwZ9wVT2Z0AZCvTF7GBpn.2";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      // The limit sits here, not in the login form's action, because Auth.js also
      // accepts logins posted straight to /api/auth/callback/credentials.
      async authorize(raw, request) {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const address = clientAddress(request.headers);
        const account = `${email}|${address}`;
        const limits = await Promise.all([
          hitRateLimit("loginAccount", account),
          hitRateLimit("loginAddress", address),
        ]);
        if (limits.some((limit) => !limit.ok)) throw new TooManyAttempts();

        const user = await prisma.user.findUnique({ where: { email } });
        const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
        if (!user?.passwordHash || !ok) return null;
        if (!user.isActive) throw new InactiveAccount();

        await clearRateLimit("loginAccount", account);
        return { id: user.id, name: user.name, email: user.email };
      },
    }),
    ...(googleEnabled
      ? [
          Google({
            // hd= shows only college accounts in Google's picker; the
            // signIn callback below is the real check.
            authorization: { params: { hd: collegeDomain!, prompt: "select_account" } },
          }),
        ]
      : []),
  ],
  callbacks: {
    ...authConfig.callbacks,

    async signIn({ account, profile }) {
      if (account?.provider !== "google") return true;

      const email = profile?.email?.toLowerCase();
      if (!email || profile?.email_verified !== true || !email.endsWith(`@${collegeDomain}`)) {
        return "/login?error=domain";
      }

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing && !existing.isActive) return "/login?error=inactive";
      if (!existing) {
        // Google proved the address, so it counts as verified. Roll number
        // and department are asked for on the profile page.
        await prisma.user.create({
          data: { email, name: profile?.name ?? email.split("@")[0], emailVerifiedAt: new Date() },
        });
      } else if (!existing.emailVerifiedAt) {
        await prisma.user.update({
          where: { id: existing.id },
          data: { emailVerifiedAt: new Date() },
        });
      }
      return true;
    },

    // Runs at sign-in with `user` set; afterwards the cookie's values are
    // reused, and getCurrentUser() checks them against the database.
    async jwt({ token, user }) {
      if (user?.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: user.email.toLowerCase() },
          select: { id: true, name: true, role: true, sessionVersion: true },
        });
        if (!dbUser) return null;
        token.uid = dbUser.id;
        token.name = dbUser.name;
        token.role = dbUser.role;
        token.sv = dbUser.sessionVersion;
      }
      return token;
    },
  },
});
