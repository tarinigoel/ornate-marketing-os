import { NextResponse } from "next/server";
import { currentUser } from "@/auth";
import { confirmCommand } from "@/lib/chat/run";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { commandId, confirm } = (await req.json()) as { commandId: number; confirm: boolean };
  try {
    return NextResponse.json(await confirmCommand(commandId, user.email, user.name, !!confirm));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
