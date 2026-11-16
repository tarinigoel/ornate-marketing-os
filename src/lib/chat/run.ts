import { and, asc, desc, eq } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import { type Ctx, logAudit } from "../audit";
import { type ChatMessage, HOUSE_RULES, LlmUnavailable, llm } from "../llm";
import { activeFocus } from "../ops";
import { istDate } from "../time";
import { TOOL_DEFS, TOOLS } from "./tools";

export type Change = { commandId: number; summary: string; undone?: boolean };
export type Pending = { commandId: number; summary: string; status?: string };
export type ChatReply = { id: number; role: "assistant"; content: string; meta: { changes: Change[]; pending: Pending[]; errors?: string[] } };

function shortResult(r: unknown): string {
  if (typeof r === "string") return r;
  if (r && typeof r === "object" && "summary" in r && typeof (r as { summary: unknown }).summary === "string") return (r as { summary: string }).summary;
  return "Done";
}

async function systemPrompt(path: string, userName: string) {
  const db = await getDb();
  const mgrs = await db
    .select({ id: s.managers.id, name: s.managers.name, status: s.managers.status, quota: s.managers.dailyQuota, stream: s.streams.slug })
    .from(s.managers)
    .innerJoin(s.streams, eq(s.managers.streamId, s.streams.id))
    .orderBy(asc(s.streams.sortOrder));
  const agents = await db.select({ id: s.agents.id, name: s.agents.name, managerId: s.agents.managerId, status: s.agents.status, quota: s.agents.dailyQuota }).from(s.agents);
  const roster = await Promise.all(
    mgrs.map(async (m) => {
      const f = await activeFocus(m.id);
      const as = agents.filter((a) => a.managerId === m.id).map((a) => `    agent ${a.id}: ${a.name} [${a.status}, quota ${a.quota}]`).join("\n");
      return `- manager ${m.id}: ${m.name} (stream ${m.stream}) [${m.status}, team quota ${m.quota}]${f ? ` focus: ${f.kind} "${f.value}" until ${f.untilDate}` : ""}\n${as}`;
    }),
  );
  let page = `The user is on page ${path}.`;
  const agentMatch = path.match(/^\/team\/agents\/(\d+)/);
  const mgrMatch = path.match(/^\/team\/managers\/(\d+)/);
  const streamMatch = path.match(/^\/streams\/([\w-]+)/);
  if (agentMatch) page += ` "This agent" means agent ${agentMatch[1]}.`;
  if (mgrMatch) page += ` "This manager" means manager ${mgrMatch[1]}.`;
  if (streamMatch) page += ` "This stream/tab" means ${streamMatch[1]}.`;
  if (path.startsWith("/ideas")) page += ` They are looking at the Ideas list.`;
  const dow = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "long" }).format(new Date());

  return `You are the command assistant of Ornate Marketing OS, the portal where AI managers and agents plan, create, review and track marketing content for Ornate Solar and UnityESS. You work for ${userName} (Fateh is the Head of Marketing; everything reports to Fateh).
Today is ${dow} ${istDate()} (India time, IST). ${page}

How to work:
- Carry out commands yourself with the tools. Find the right manager, agent, idea or item yourself (use the roster below, list_ideas, list_items); only ask a question if it is truly ambiguous.
- Changes apply immediately and the user gets an Undo button for each, so do not ask "are you sure" for ordinary changes. Publishing and retiring wait for the user's Confirm click automatically.
- To change a job description, read it first, then save the full improved text.
- When asked to make content ("make 5 reels on X"), write distinct, specific titles and use create_items; managers draft them in their plan.
- When asked to rewrite text, just write it (and save it with update_item if it belongs to an item).
- Answer questions from the portal's data (get_activity, list_*). Never make up numbers, customers or results.
- Reply briefly in plain English: what you did, in a short list. Use item/idea ids like #12. No markdown tables.
- Content phases: phase 1 (now) runs Ideas, team, focus, plans and reports. LinkedIn/Instagram/Blog drafting arrives in phase 2; emailers, brochures, case studies, white papers, PR in phase 3; Video Studio in phase 4; publishing connectors and metrics in phase 5. You can still queue items for any stream.

${HOUSE_RULES}

Team roster:
${roster.join("\n")}`;
}

export async function loadHistory(sessionId: string, userEmail: string) {
  const db = await getDb();
  return db
    .select()
    .from(s.chatMessages)
    .where(and(eq(s.chatMessages.sessionId, sessionId), eq(s.chatMessages.userEmail, userEmail)))
    .orderBy(asc(s.chatMessages.id))
    .limit(200);
}

export async function runChat(opts: { sessionId: string; userEmail: string; userName: string; message: string; path: string }): Promise<ChatReply> {
  const db = await getDb();
  await db.insert(s.chatMessages).values({ sessionId: opts.sessionId, userEmail: opts.userEmail, role: "user", content: opts.message, meta: { path: opts.path } });

  const past = await db
    .select()
    .from(s.chatMessages)
    .where(and(eq(s.chatMessages.sessionId, opts.sessionId), eq(s.chatMessages.userEmail, opts.userEmail)))
    .orderBy(desc(s.chatMessages.id))
    .limit(16);
  past.reverse();
  const history: ChatMessage[] = past.map((m) => {
    const changes = ((m.meta as { changes?: Change[] }).changes ?? []).map((c) => `#cmd${c.commandId}: ${c.summary}`);
    return m.role === "user"
      ? { role: "user", content: m.content }
      : { role: "assistant", content: m.content + (changes.length ? `\n(changes made: ${changes.join("; ")})` : "") };
  });

  const messages: ChatMessage[] = [{ role: "system", content: await systemPrompt(opts.path, opts.userName) }, ...history];
  const changes: Change[] = [];
  const pending: Pending[] = [];
  const errors: string[] = [];
  let final = "";
  const actorName = `${opts.userName} via chat`;

  try {
    for (let step = 0; step < 10; step++) {
      const res = await llm({ purpose: "chat", actor: actorName, messages, tools: TOOL_DEFS, maxTokens: 3000 });
      if (!res.toolCalls.length) {
        final = res.content;
        break;
      }
      messages.push({ role: "assistant", content: res.content || null, tool_calls: res.toolCalls });
      for (const tc of res.toolCalls) {
        const tool = TOOLS[tc.function.name];
        let result: unknown;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments || "{}");
        } catch {
          result = { error: "Arguments were not valid JSON" };
        }
        if (!tool) result = { error: `Unknown tool ${tc.function.name}` };
        else if (!result) {
          if (tool.confirm?.(args)) {
            const summary = tool.describe?.(args) ?? tc.function.name;
            const [cmd] = await db.insert(s.chatCommands).values({ sessionId: opts.sessionId, userEmail: opts.userEmail, tool: tc.function.name, args, summary, status: "pending_confirm" }).returning();
            pending.push({ commandId: cmd.id, summary });
            await logAudit({ actorType: "chat", actorName }, { action: "chat_pending", entity: "chat_commands", entityId: cmd.id, summary: `Waiting for confirmation: ${summary}`, after: args });
            result = { status: "waiting_for_confirmation", note: "A Confirm button is shown to the user. Do not call this tool again; tell the user to press Confirm." };
          } else if (tool.mutates) {
            const [cmd] = await db.insert(s.chatCommands).values({ sessionId: opts.sessionId, userEmail: opts.userEmail, tool: tc.function.name, args, status: "done" }).returning();
            const ctx: Ctx = { actorType: "chat", actorName, commandId: cmd.id };
            try {
              result = await tool.run(args, ctx);
              const summary = shortResult(result);
              await db.update(s.chatCommands).set({ summary }).where(eq(s.chatCommands.id, cmd.id));
              changes.push({ commandId: cmd.id, summary });
            } catch (e) {
              const msg = (e as Error).message;
              await db.update(s.chatCommands).set({ status: "error", summary: msg }).where(eq(s.chatCommands.id, cmd.id));
              errors.push(msg);
              result = { error: msg };
            }
          } else {
            try {
              result = await tool.run(args, { actorType: "chat", actorName });
              await logAudit({ actorType: "chat", actorName }, { action: "chat_read", entity: "chat", summary: `${tc.function.name}(${JSON.stringify(args).slice(0, 200)})` });
            } catch (e) {
              result = { error: (e as Error).message };
            }
          }
        }
        messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result ?? "ok").slice(0, 12000) });
      }
    }
    if (!final) final = changes.length ? "Done." : "I could not finish that. Try rephrasing?";
  } catch (e) {
    if (!(e instanceof LlmUnavailable)) throw e;
    final = `The AI assistant is offline right now (${e.message}). One-tap buttons across the portal still work.${changes.length ? " Changes made before it stopped are listed below." : ""}`;
  }

  const [row] = await db
    .insert(s.chatMessages)
    .values({ sessionId: opts.sessionId, userEmail: opts.userEmail, role: "assistant", content: final, meta: { changes, pending, errors } })
    .returning();
  return { id: row.id, role: "assistant", content: final, meta: { changes, pending, errors } };
}

/** Run a command that was waiting for the user's Confirm click. */
export async function confirmCommand(commandId: number, userEmail: string, userName: string, confirm: boolean) {
  const db = await getDb();
  const [cmd] = await db.select().from(s.chatCommands).where(eq(s.chatCommands.id, commandId));
  if (!cmd || cmd.userEmail !== userEmail) throw new Error("Command not found");
  if (cmd.status !== "pending_confirm") throw new Error(`Command already ${cmd.status}`);
  const actorName = `${userName} via chat`;
  if (!confirm) {
    await db.update(s.chatCommands).set({ status: "cancelled" }).where(eq(s.chatCommands.id, commandId));
    await logAudit({ actorType: "chat", actorName }, { action: "chat_cancel", entity: "chat_commands", entityId: commandId, summary: `Cancelled: ${cmd.summary}` });
    return { status: "cancelled", summary: `Cancelled: ${cmd.summary}` };
  }
  const tool = TOOLS[cmd.tool];
  try {
    const result = await tool.run(cmd.args, { actorType: "chat", actorName, commandId });
    const summary = shortResult(result);
    await db.update(s.chatCommands).set({ status: "done", summary }).where(eq(s.chatCommands.id, commandId));
    return { status: "done", summary };
  } catch (e) {
    await db.update(s.chatCommands).set({ status: "error", summary: (e as Error).message }).where(eq(s.chatCommands.id, commandId));
    throw e;
  }
}
