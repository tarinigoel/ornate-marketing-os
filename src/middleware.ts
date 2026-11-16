import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Everything except sign-in, auth endpoints, cron (uses CRON_SECRET) and static files.
  matcher: ["/((?!login|api/auth|api/cron|_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
