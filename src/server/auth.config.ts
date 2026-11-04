import type { NextAuthConfig } from "next-auth";
import type { Role } from "@/generated/prisma/enums";

// The part of the Auth.js setup that needs no database, shared by the proxy
// (src/proxy.ts) and the full setup in src/server/auth.ts.

declare module "next-auth" {
  interface Session {
    user: { id: string; role: Role; sv: number; name: string; email: string };
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    uid?: string;
    role?: Role;
    // The user's sessionVersion when they logged in; see getCurrentUser().
    sv?: number;
  }
}

export const authConfig = {
  // Credentials sign-in needs JWT sessions: the login lives in a signed,
  // encrypted cookie instead of a sessions table.
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
  trustHost: true,
  providers: [],
  callbacks: {
    session({ session, token }) {
      session.user.id = token.uid ?? "";
      session.user.role = token.role ?? "STUDENT";
      session.user.sv = token.sv ?? 0;
      return session;
    },
  },
} satisfies NextAuthConfig;
