import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import type { Stage } from "@/db/schema";
import { STAGES } from "@/db/schema";
import { type Ctx, insertAudited, updateAudited } from "./audit";
import { istDate } from "./time";

export class OpError extends Error {}

export async function getStreamBySlug(slug: string) {
  const db = await getDb();
  const [st] = await db.select().from(s.streams).where(eq(s.streams.slug, slug));
  if (!st) throw new OpError(`Unknown stream "${slug}"`);
  return st;
}

export async function managerForStream(slug: string) {
  const db = await getDb();
  const st = await getStreamBySlug(slug);
  const [m] = await db.select().from(s.managers).where(eq(s.managers.streamId, st.id));
  return { stream: st, manager: m };
}

/* ---------- Team ---------- */

const STATUSES = ["active", "paused", "retired"] as const;

export async function setStatus(ctx: Ctx, type: "agent" | "manager", id: number, status: string) {
  if (!STATUSES.includes(status as never)) throw new OpError(`Status must be one of ${STATUSES.join(", ")}`);
  const entity = type === "agent" ? "agents" : "managers";
  const db = await getDb();
  const table = type === "agent" ? s.agents : s.managers;
  const [row] = await db.select().from(table).where(eq(table.id, id));
  if (!row) throw new OpError(`No ${type} #${id}`);
  if (row.status === status) return `${row.name} is already ${status}`;
  const verb = status === "active" ? "Resumed" : status === "paused" ? "Paused" : "Retired";
  await updateAudited(ctx, entity, id, { status }, `${verb} ${row.name}`);
  return `${verb} ${row.name}`;
}

export async function setQuota(ctx: Ctx, type: "agent" | "manager", id: number, quota: number) {
  if (!Number.isFinite(quota) || quota < 0 || quota > 100) throw new OpError("Quota must be between 0 and 100");
  const entity = type === "agent" ? "agents" : "managers";
  const db = await getDb();
  const table = type === "agent" ? s.agents : s.managers;
  const [row] = await db.select().from(table).where(eq(table.id, id));
  if (!row) throw new OpError(`No ${type} #${id}`);
  await updateAudited(ctx, entity, id, { dailyQuota: Math.round(quota) }, `${row.name}: daily quota ${row.dailyQuota} → ${Math.round(quota)}`);
  return `${row.name}: daily quota ${row.dailyQuota} → ${Math.round(quota)}`;
}

export async function setFocus(ctx: Ctx, managerId: number, kind: string, value: string, until: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(until)) throw new OpError("Until must be a date (YYYY-MM-DD)");
  const db = await getDb();
  const [m] = await db.select().from(s.managers).where(eq(s.managers.id, managerId));
  if (!m) throw new OpError(`No manager #${managerId}`);
  const current = await db.select().from(s.focuses).where(and(eq(s.focuses.managerId, managerId), eq(s.focuses.active, true)));
  for (const f of current) await updateAudited(ctx, "focuses", f.id, { active: false }, `${m.name}: ended focus "${f.value}"`);
  await insertAudited(ctx, "focuses", { managerId, kind, value, untilDate: until, createdBy: ctx.actorName }, `${m.name}: focus on ${kind} "${value}" until ${until}`);
  return `${m.name} now focuses on ${kind} “${value}” until ${until}`;
}

export async function clearFocus(ctx: Ctx, managerId: number) {
  const db = await getDb();
  const [m] = await db.select().from(s.managers).where(eq(s.managers.id, managerId));
  if (!m) throw new OpError(`No manager #${managerId}`);
  const current = await db.select().from(s.focuses).where(and(eq(s.focuses.managerId, managerId), eq(s.focuses.active, true)));
  for (const f of current) await updateAudited(ctx, "focuses", f.id, { active: false }, `${m.name}: ended focus "${f.value}"`);
  return current.length ? `${m.name}: focus cleared` : `${m.name} had no focus`;
}

export async function activeFocus(managerId: number) {
  const db = await getDb();
  const today = istDate();
  const rows = await db
    .select()
    .from(s.focuses)
    .where(and(eq(s.focuses.managerId, managerId), eq(s.focuses.active, true), sql`${s.focuses.untilDate} >= ${today}`))
    .orderBy(desc(s.focuses.id));
  return rows[0] ?? null;
}

export async function currentJob(type: "agent" | "manager", id: number) {
  const db = await getDb();
  const [jd] = await db
    .select()
    .from(s.jobDescriptions)
    .where(and(eq(s.jobDescriptions.ownerType, type), eq(s.jobDescriptions.ownerId, id)))
    .orderBy(desc(s.jobDescriptions.version))
    .limit(1);
  return jd ?? null;
}

export async function saveJobDescription(ctx: Ctx, type: "agent" | "manager", id: number, prompt: string, note?: string) {
  const db = await getDb();
  const table = type === "agent" ? s.agents : s.managers;
  const [row] = await db.select().from(table).where(eq(table.id, id));
  if (!row) throw new OpError(`No ${type} #${id}`);
  const cur = await currentJob(type, id);
  if (cur && cur.prompt.trim() === prompt.trim()) return `${row.name}: no change to job description`;
  const version = (cur?.version ?? 0) + 1;
  await insertAudited(
    ctx,
    "job_descriptions",
    { ownerType: type, ownerId: id, version, prompt: prompt.trim(), note: note ?? null, createdBy: ctx.actorName },
    `${row.name}: job description v${version}${note ? ` (${note})` : ""}`,
  );
  return `${row.name}: job description saved as v${version}`;
}

/* ---------- Ideas ---------- */

export async function decideIdeas(ctx: Ctx, ids: number[], decision: "approve" | "reject", opts: { reason?: string; stream?: string } = {}) {
  const db = await getDb();
  const rows = await db.select().from(s.ideas).where(inArray(s.ideas.id, ids));
  if (!rows.length) throw new OpError("No matching ideas");
  const out: string[] = [];
  for (const idea of rows) {
    if (decision === "reject") {
      await updateAudited(ctx, "ideas", idea.id, { status: "rejected", rejectReason: opts.reason ?? "No reason given", decidedBy: ctx.actorName, decidedAt: new Date() }, `Rejected idea #${idea.id} “${idea.title}”${opts.reason ? ` — ${opts.reason}` : ""}`);
      await insertAudited(ctx, "approvals", { subjectType: "idea", subjectId: idea.id, level: "head", decision: "rejected", comment: opts.reason ?? null, decidedBy: ctx.actorName }, `Rejection recorded for idea #${idea.id}`);
      out.push(`Rejected #${idea.id}`);
      continue;
    }
    const slug = opts.stream ?? idea.streams.find((x) => x !== "ideas") ?? "linkedin-company";
    const { stream, manager } = await managerForStream(slug);
    await updateAudited(ctx, "ideas", idea.id, { status: "approved", managerId: manager.id, decidedBy: ctx.actorName, decidedAt: new Date(), rejectReason: null }, `Approved idea #${idea.id} “${idea.title}” → ${stream.name}`);
    await insertAudited(ctx, "approvals", { subjectType: "idea", subjectId: idea.id, level: "head", decision: "approved", decidedBy: ctx.actorName }, `Approval recorded for idea #${idea.id}`);
    const brand = idea.brand === "both" ? "ornate" : idea.brand;
    await insertAudited(
      ctx,
      "content_items",
      { streamId: stream.id, brand, title: idea.title, brief: [idea.detail, idea.whyNow && `Why now: ${idea.whyNow}`].filter(Boolean).join("\n"), ideaId: idea.id, stage: "approved_idea", createdBy: ctx.actorName },
      `New ${stream.name} item from idea #${idea.id}`,
    );
    out.push(`Approved #${idea.id} → ${stream.name}`);
  }
  return out.join("; ");
}

export async function editIdea(ctx: Ctx, id: number, patch: { title?: string; whyNow?: string; detail?: string; streams?: string[]; brand?: string }) {
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  if (!Object.keys(clean).length) throw new OpError("Nothing to change");
  const row = await updateAudited(ctx, "ideas", id, clean, `Edited idea #${id}: ${Object.keys(clean).join(", ")}`);
  if (!row) throw new OpError(`No idea #${id}`);
  return `Edited idea #${id}`;
}

/* ---------- Content items ---------- */

export async function createItems(
  ctx: Ctx,
  opts: { stream: string; titles: string[]; brand: string; format?: string; language?: string; dueDate?: string; brief?: string; parentId?: number },
) {
  const { stream } = await managerForStream(opts.stream);
  const created: number[] = [];
  for (const title of opts.titles) {
    const row = await insertAudited<{ id: number }>(
      ctx,
      "content_items",
      {
        streamId: stream.id,
        brand: opts.brand,
        title,
        brief: opts.brief ?? "",
        format: opts.format ?? "post",
        language: opts.language ?? "en",
        dueDate: opts.dueDate ?? null,
        parentId: opts.parentId ?? null,
        stage: "approved_idea",
        createdBy: ctx.actorName,
      },
      `Requested ${stream.name} item “${title}”`,
    );
    created.push(row.id);
  }
  return { ids: created, summary: `Added ${created.length} ${stream.name} item(s) to the pipeline (#${created.join(", #")})` };
}

async function itemsById(ids: number[]) {
  const db = await getDb();
  const rows = await db.select().from(s.contentItems).where(inArray(s.contentItems.id, ids));
  if (!rows.length) throw new OpError("No matching content items");
  return rows;
}

export async function updateItem(ctx: Ctx, id: number, patch: { title?: string; body?: string; brief?: string; language?: string; dueDate?: string }) {
  const db = await getDb();
  const [r] = await db.select().from(s.contentItems).where(eq(s.contentItems.id, id));
  if (!r) throw new OpError(`No item #${id}`);
  const clean: Record<string, unknown> = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  if (!Object.keys(clean).length) throw new OpError("Nothing to change");
  if (clean.body !== undefined) {
    clean.hasNumbers = /\d/.test(String(clean.body));
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.itemVersions).where(eq(s.itemVersions.itemId, id));
    await insertAudited(ctx, "item_versions", { itemId: id, version: n + 1, body: clean.body, createdBy: ctx.actorName }, `#${id}: body v${n + 1}`);
  }
  await updateAudited(ctx, "content_items", id, clean, `Edited #${id} “${r.title}”: ${Object.keys(clean).filter((k) => k !== "hasNumbers").join(", ")}`);
  return `Updated #${id}${clean.hasNumbers ? " (contains numbers: flagged for your check)" : ""}`;
}

export async function moveItems(ctx: Ctx, ids: number[], stage: Stage) {
  if (!STAGES.includes(stage)) throw new OpError(`Stage must be one of ${STAGES.join(", ")}`);
  const rows = await itemsById(ids);
  for (const r of rows) await updateAudited(ctx, "content_items", r.id, { stage, stageChangedAt: new Date() }, `#${r.id} “${r.title}”: ${r.stage} → ${stage}`);
  return `Moved ${rows.length} item(s) to ${stage.replace(/_/g, " ")}`;
}

export async function approveItems(ctx: Ctx, ids: number[], comment?: string) {
  const rows = await itemsById(ids);
  const out: string[] = [];
  for (const r of rows) {
    const next: Stage = r.stage === "idea" ? "approved_idea" : ["in_review", "waiting_for_me", "drafting"].includes(r.stage) ? "scheduled" : r.stage;
    await insertAudited(ctx, "approvals", { subjectType: "item", subjectId: r.id, level: "head", decision: "approved", comment: comment ?? null, decidedBy: ctx.actorName }, `Approved #${r.id} “${r.title}”`);
    if (next !== r.stage) await updateAudited(ctx, "content_items", r.id, { stage: next, stageChangedAt: new Date() }, `#${r.id}: ${r.stage} → ${next}`);
    out.push(`#${r.id}`);
  }
  return `Approved ${out.join(", ")}`;
}

export async function rejectItems(ctx: Ctx, ids: number[], feedback: string) {
  const rows = await itemsById(ids);
  for (const r of rows) {
    await insertAudited(ctx, "approvals", { subjectType: "item", subjectId: r.id, level: "head", decision: "changes", comment: feedback, decidedBy: ctx.actorName }, `Sent back #${r.id}: ${feedback}`);
    await updateAudited(ctx, "content_items", r.id, { stage: "drafting", stageChangedAt: new Date() }, `#${r.id}: ${r.stage} → drafting (feedback)`);
  }
  return `Sent ${rows.length} item(s) back with feedback`;
}

export async function scheduleItems(ctx: Ctx, schedule: { id: number; at: Date }[]) {
  const db = await getDb();
  const out: string[] = [];
  for (const { id, at } of schedule) {
    const [r] = await db.select().from(s.contentItems).where(eq(s.contentItems.id, id));
    if (!r) throw new OpError(`No item #${id}`);
    const approved = await hasHeadApproval(id);
    const patch: Record<string, unknown> = { scheduledAt: at };
    if (approved && r.stage !== "published") {
      patch.stage = "scheduled";
      patch.stageChangedAt = new Date();
    }
    await updateAudited(ctx, "content_items", id, patch, `Scheduled #${id} “${r.title}” for ${at.toISOString()}`);
    out.push(`#${id}${approved ? "" : " (date set; still needs your approval)"}`);
  }
  return `Scheduled ${out.join(", ")}`;
}

export async function hasHeadApproval(itemId: number) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(s.approvals)
    .where(and(eq(s.approvals.subjectType, "item"), eq(s.approvals.subjectId, itemId), eq(s.approvals.level, "head")))
    .orderBy(desc(s.approvals.id))
    .limit(1);
  return rows[0]?.decision === "approved" ? rows[0] : null;
}

/** Export + mark published. Refuses without a human approval on record. */
export async function markPublished(ctx: Ctx, id: number, url?: string, channel?: string) {
  const db = await getDb();
  const [r] = await db.select().from(s.contentItems).where(eq(s.contentItems.id, id));
  if (!r) throw new OpError(`No item #${id}`);
  const approval = await hasHeadApproval(id);
  if (!approval) throw new OpError(`#${id} has no approval on record, so it cannot be published`);
  let channelId: number | null = null;
  if (channel) {
    const [c] = await db.select().from(s.channels).where(eq(s.channels.slug, channel));
    channelId = c?.id ?? null;
  }
  await insertAudited(ctx, "publications", { itemId: id, channelId, url: url ?? null, approvalId: approval.id, publishedBy: ctx.actorName }, `Published #${id} “${r.title}”`);
  await updateAudited(ctx, "content_items", id, { stage: "published", publishedAt: new Date(), stageChangedAt: new Date() }, `#${id}: ${r.stage} → published`);
  return `Marked #${id} “${r.title}” as published`;
}

/* ---------- Facts & settings ---------- */

export async function addFact(ctx: Ctx, f: { brand: string; category: string; statement: string; source: string; approve: boolean }) {
  const row = await insertAudited<{ id: number }>(
    ctx,
    "brand_facts",
    { brand: f.brand, category: f.category, statement: f.statement, source: f.source, status: f.approve ? "approved" : "pending", approvedBy: f.approve ? ctx.actorName : null },
    `Brand fact ${f.approve ? "approved" : "proposed"}: ${f.statement}`,
  );
  return `Brand fact #${row.id} ${f.approve ? "added and approved" : "added (pending your approval)"}`;
}

export async function setFactStatus(ctx: Ctx, id: number, status: "approved" | "pending" | "retired") {
  const row = await updateAudited<{ statement: string }>(ctx, "brand_facts", id, { status, approvedBy: status === "approved" ? ctx.actorName : null }, `Brand fact #${id} → ${status}`);
  if (!row) throw new OpError(`No fact #${id}`);
  return `Fact #${id} is now ${status}`;
}

export async function approvedFacts() {
  const db = await getDb();
  return db.select().from(s.brandFacts).where(eq(s.brandFacts.status, "approved")).orderBy(asc(s.brandFacts.id));
}

export async function setLlmModel(ctx: Ctx, purpose: string, model: string, provider = "groq", temperature?: number) {
  const db = await getDb();
  const [row] = await db.select().from(s.llmSettings).where(eq(s.llmSettings.purpose, purpose));
  if (!row) throw new OpError(`Unknown purpose "${purpose}" (chat, planning, research, writing)`);
  const patch: Record<string, unknown> = { model, provider };
  if (temperature !== undefined) patch.temperature = String(temperature);
  await updateAudited(ctx, "llm_settings", row.id, patch, `AI model for ${purpose}: ${row.provider}/${row.model} → ${provider}/${model}`);
  return `AI model for ${purpose} is now ${provider}/${model}`;
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const db = await getDb();
  const [row] = await db.select().from(s.appSettings).where(eq(s.appSettings.key, key));
  return (row?.value as T) ?? fallback;
}

export async function setSetting(ctx: Ctx, key: string, value: unknown) {
  const db = await getDb();
  const [row] = await db.select().from(s.appSettings).where(eq(s.appSettings.key, key));
  if (row) await updateAudited(ctx, "app_settings", key, { value }, `Setting ${key} changed`);
  else await insertAudited(ctx, "app_settings", { key, value }, `Setting ${key} set`);
  return `Saved ${key}`;
}
