import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/server/auth.config";
import { allowedRoles } from "@/lib/access";

// Fast first check on every page request, before anything renders:
// signed-out users are sent to /login, wrong roles get a real HTTP 403.
// It only reads the login cookie. Pages and actions still check the
// database with requireRole(), which also catches deactivated accounts.
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname, search } = req.nextUrl;
  const user = req.auth?.user;

  const roles = allowedRoles(pathname);
  if (!roles) return NextResponse.next();

  if (!user) {
    const login = new URL("/login", req.nextUrl);
    login.searchParams.set("next", pathname + search);
    return NextResponse.redirect(login);
  }

  if (!roles.includes(user.role)) {
    return NextResponse.rewrite(new URL("/403", req.nextUrl), { status: 403 });
  }

  return NextResponse.next();
});

export const config = {
  // Skip API routes, Next.js internals and files with an extension.
  matcher: ["/((?!api|_next/static|_next/image|.*\\.[\\w]+$).*)"],
};
