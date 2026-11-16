import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

export function emailAllowed(email?: string | null) {
  if (!email) return false;
  const e = email.toLowerCase();
  const domain = (process.env.ALLOWED_DOMAIN ?? "ornatesolar.com").toLowerCase();
  const extra = (process.env.ALLOWED_EMAILS ?? "").toLowerCase().split(",").map((x) => x.trim()).filter(Boolean);
  return e.endsWith(`@${domain}`) || extra.includes(e);
}

export function devLoginEnabled() {
  return process.env.AUTH_DEV_LOGIN === "true" && process.env.NODE_ENV !== "production";
}

/** Edge-safe part of the config (used by middleware). */
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [
    Google({
      authorization: { params: { hd: process.env.ALLOWED_DOMAIN ?? "ornatesolar.com", prompt: "select_account" } },
    }),
  ],
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user && emailAllowed(auth.user.email);
    },
    signIn({ user, profile }) {
      const email = (profile?.email as string | undefined) ?? user.email;
      if (profile && "email_verified" in profile && profile.email_verified === false) return false;
      return emailAllowed(email);
    },
  },
} satisfies NextAuthConfig;
