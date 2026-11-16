import { NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { currentUser } from "@/auth";
import { getDb, schema as s } from "@/db";
import { type Change, type Pending, loadHistory, runChat } from "@/lib/chat/run";

export const maxDuration = 60;

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const sessionId = new URL(req.url).searchParams.get("sessionId") ?? "";
  const rows = await loadHistory(sessionId, user.email);
  // Merge the latest status of each command (undone / confirmed / cancelled).
  const ids = rows.flatMap((r) => {
    const m = r.meta as { changes?: Change[]; pending?: Pending[] };
    return [...(m.changes ?? []), ...(m.pending ?? [])].map((c) => c.commandId);
  });
  const db = await getDb();
  const cmds = ids.length ? await db.select().from(s.chatCommands).where(inArray(s.chatCommands.id, ids)) : [];
  const status = new Map(cmds.map((c) => [c.id, c]));
  const messages = rows.map((r) => {
    const m = r.meta as { changes?: Change[]; pending?: Pending[] };
    return {
      id: r.id,
      role: r.role,
      content: r.content,
      meta: {
        changes: (m.changes ?? []).map((c) => ({ ...c, undone: status.get(c.commandId)?.status === "undone" })),
        pending: (m.pending ?? []).map((p) => ({ ...p, status: status.get(p.commandId)?.status, summary: status.get(p.commandId)?.status === "done" ? status.get(p.commandId)!.summary : p.summary })),
      },
    };
  });
  return NextResponse.json({ messages });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = (await req.json()) as { sessionId?: string; message?: string; path?: string };
  if (!body.sessionId || !body.message?.trim()) return NextResponse.json({ error: "Missing message" }, { status: 400 });
  try {
    const reply = await runChat({ sessionId: body.sessionId, userEmail: user.email, userName: user.name, message: body.message.trim().slice(0, 4000), path: body.path ?? "/" });
    return NextResponse.json(reply);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
