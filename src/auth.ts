import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import { authConfig, devLoginEnabled, emailAllowed } from "./auth.config";
import { getDb, schema as s } from "@/db";

function roleFor(email: string) {
  const heads = (process.env.HEAD_EMAILS ?? "").toLowerCase().split(",").map((x) => x.trim());
  return heads.includes(email.toLowerCase()) ? "head" : "member";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    ...authConfig.providers,
    ...(devLoginEnabled()
      ? [
          Credentials({
            id: "dev",
            name: "Dev sign-in",
            credentials: { email: { label: "Email" } },
            authorize: async (c) => {
              const email = String(c?.email ?? "").trim().toLowerCase();
              if (!emailAllowed(email)) return null;
              return { id: email, email, name: email.split("@")[0].replace(/^\w/, (x) => x.toUpperCase()) };
            },
          }),
        ]
      : []),
  ],
  events: {
    async signIn({ user }) {
      if (!user.email) return;
      const db = await getDb();
      const email = user.email.toLowerCase();
      const [row] = await db.select().from(s.users).where(eq(s.users.email, email));
      if (row) await db.update(s.users).set({ lastSeenAt: new Date(), name: user.name ?? row.name }).where(eq(s.users.id, row.id));
      else await db.insert(s.users).values({ email, name: user.name ?? null, role: roleFor(email), lastSeenAt: new Date() });
    },
  },
});

/** The signed-in person, for server components, actions and route handlers. */
export async function currentUser() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email || !emailAllowed(email)) return null;
  return { email, name: session?.user?.name ?? email.split("@")[0], role: roleFor(email) };
}
