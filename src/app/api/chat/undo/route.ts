import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { currentUser } from "@/auth";
import { getDb, schema as s } from "@/db";
import { undoCommand } from "@/lib/audit";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { commandId } = (await req.json()) as { commandId: number };
  const db = await getDb();
  const [cmd] = await db.select().from(s.chatCommands).where(eq(s.chatCommands.id, commandId));
  if (!cmd || cmd.userEmail !== user.email) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (cmd.status === "undone") return NextResponse.json({ ok: true, undone: [] });
  const undone = await undoCommand(commandId, { actorType: "human", actorName: `${user.name} (undo)` });
  return NextResponse.json({ ok: true, undone });
}
