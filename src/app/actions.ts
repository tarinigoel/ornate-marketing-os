"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { currentUser } from "@/auth";
import { getDb, schema as s } from "@/db";
import type { Ctx } from "@/lib/audit";
import * as ops from "@/lib/ops";
import { buildAllPlans, buildPlan, writeAllReports } from "@/lib/planning";
import { researchTick } from "@/lib/research";

export type ActResult = { ok: boolean; message: string };

async function act(fn: (ctx: Ctx) => Promise<unknown>): Promise<ActResult> {
  const user = await currentUser();
  if (!user) return { ok: false, message: "Not signed in" };
  try {
    const r = await fn({ actorType: "human", actorName: user.name });
    revalidatePath("/", "layout");
    return { ok: true, message: typeof r === "string" ? r : Array.isArray(r) ? r.join("\n") : "Done" };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

export async function actSetStatus(type: "agent" | "manager", id: number, status: string) {
  return act((ctx) => ops.setStatus(ctx, type, id, status));
}

export async function actQuotaDelta(type: "agent" | "manager", id: number, delta: number) {
  return act(async (ctx) => {
    const db = await getDb();
    const t = type === "agent" ? s.agents : s.managers;
    const [row] = await db.select().from(t).where(eq(t.id, id));
    return ops.setQuota(ctx, type, id, Math.max(0, row.dailyQuota + delta));
  });
}

export async function actSaveJob(type: "agent" | "manager", id: number, prompt: string, note: string) {
  return act((ctx) => ops.saveJobDescription(ctx, type, id, prompt, note || undefined));
}

export async function actDecideIdea(id: number, decision: "approve" | "reject", reason?: string) {
  return act((ctx) => ops.decideIdeas(ctx, [id], decision, { reason }));
}

export async function actFindIdeas() {
  return act(() => researchTick());
}

export async function actRunPlans(managerId?: number) {
  return act(() => (managerId ? buildPlan(managerId, { force: true }) : buildAllPlans({ force: true })));
}

export async function actWriteReports() {
  return act(async () => {
    const r = await writeAllReports();
    return `Reports written for ${r.managers} managers; summary delivered to ${r.delivered.join(", ") || "nowhere yet (set the Instinct webhook in Settings)"}`;
  });
}

export async function actClearFocus(managerId: number) {
  return act((ctx) => ops.clearFocus(ctx, managerId));
}

export async function actApproveItem(id: number) {
  return act((ctx) => ops.approveItems(ctx, [id]));
}

export async function actSendBack(id: number, feedback: string) {
  return act((ctx) => ops.rejectItems(ctx, [id], feedback || "Needs changes"));
}

export async function actSetLlm(purpose: string, model: string) {
  return act((ctx) => ops.setLlmModel(ctx, purpose, model.trim()));
}

export async function actSetSetting(key: string, value: string) {
  return act((ctx) => ops.setSetting(ctx, key, value.trim()));
}

export async function actAddFact(brand: string, category: string, statement: string, source: string) {
  return act((ctx) => ops.addFact(ctx, { brand, category, statement, source, approve: true }));
}

export async function actFactStatus(id: number, status: "approved" | "pending" | "retired") {
  return act((ctx) => ops.setFactStatus(ctx, id, status));
}
