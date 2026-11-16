import type { Metadata } from "next";
import { eq, sql } from "drizzle-orm";
import { auth, currentUser, signOut } from "@/auth";
import ChatWidget from "@/components/ChatWidget";
import Nav, { type NavGroup } from "@/components/Nav";
import { Toaster } from "@/components/ui";
import { getDb, schema as s } from "@/db";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ornate Marketing OS",
  description: "AI managers and agents that plan, create, review and track marketing for Ornate Solar and UnityESS.",
};

async function navGroups(): Promise<NavGroup[]> {
  const db = await getDb();
  const streams = await db.select().from(s.streams).orderBy(s.streams.sortOrder);
  const [{ n: waitingIdeas }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.ideas).where(eq(s.ideas.status, "waiting"));
  const waitingByStream = await db
    .select({ streamId: s.contentItems.streamId, n: sql<number>`count(*)::int` })
    .from(s.contentItems)
    .where(eq(s.contentItems.stage, "waiting_for_me"))
    .groupBy(s.contentItems.streamId);
  const w = new Map(waitingByStream.map((r) => [r.streamId, r.n]));
  return [
    { items: [{ href: "/", label: "Overview" }, { href: "/ideas", label: "Ideas", badge: waitingIdeas || undefined }] },
    {
      title: "Content streams",
      items: streams.filter((x) => x.kind === "content").map((x) => ({ href: `/streams/${x.slug}`, label: x.name, badge: w.get(x.id) || undefined })),
    },
    {
      title: "Studio & channels",
      items: [
        { href: "/streams/video-studio", label: "Video Studio", muted: true },
        { href: "/publishing", label: "Publishing & metrics", muted: true },
      ],
    },
    {
      title: "Run the team",
      items: [
        { href: "/team", label: "Managers & agents" },
        { href: "/facts", label: "Brand facts" },
        { href: "/audit", label: "Audit log" },
        { href: "/settings", label: "Settings" },
      ],
    },
  ];
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const user = session ? await currentUser() : null;
  return (
    <html lang="en-IN">
      <body>
        {user ? (
          <div className="shell">
            <Nav
              groups={await navGroups()}
              userName={user.name}
              signOutSlot={
                <form
                  action={async () => {
                    "use server";
                    await signOut({ redirectTo: "/login" });
                  }}
                >
                  <button className="link-btn small">Sign out</button>
                </form>
              }
            />
            <main className="main">{children}</main>
            <ChatWidget userName={user.name} />
          </div>
        ) : (
          children
        )}
        <Toaster />
      </body>
    </html>
  );
}
