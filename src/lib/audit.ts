import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema as s } from "@/db";

export type Ctx = {
  actorType: "human" | "agent" | "manager" | "chat" | "system";
  actorName: string;
  commandId?: number;
};

/** Tables that may be changed through the audited helpers (and therefore undone). */
export const ENTITIES = {
  managers: s.managers,
  agents: s.agents,
  job_descriptions: s.jobDescriptions,
  focuses: s.focuses,
  ideas: s.ideas,
  content_items: s.contentItems,
  brand_facts: s.brandFacts,
  approvals: s.approvals,
  llm_settings: s.llmSettings,
  app_settings: s.appSettings,
  work_plans: s.workPlans,
  plan_items: s.planItems,
  item_versions: s.itemVersions,
  publications: s.publications,
} as const;
export type Entity = keyof typeof ENTITIES;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any;

function pk(entity: Entity) {
  const t = ENTITIES[entity] as AnyTable;
  return entity === "app_settings" ? t.key : t.id;
}

export async function logAudit(
  ctx: Ctx,
  e: { action: string; entity: string; entityId?: string | number | null; summary: string; before?: unknown; after?: unknown },
) {
  const db = await getDb();
  await db.insert(s.auditLog).values({
    actorType: ctx.actorType,
    actorName: ctx.actorName,
    action: e.action,
    entity: e.entity,
    entityId: e.entityId == null ? null : String(e.entityId),
    summary: e.summary,
    before: (e.before ?? null) as never,
    after: (e.after ?? null) as never,
    commandId: ctx.commandId ?? null,
  });
}

export async function insertAudited<T extends Record<string, unknown>>(
  ctx: Ctx,
  entity: Entity,
  values: Record<string, unknown>,
  summary: string,
): Promise<T> {
  const db = await getDb();
  const table = ENTITIES[entity] as AnyTable;
  const [row] = (await db.insert(table).values(values).returning()) as T[];
  await logAudit(ctx, { action: "insert", entity, entityId: ((row as Record<string, unknown>).id ?? (row as Record<string, unknown>).key) as number, summary, before: null, after: row });
  return row;
}

export async function updateAudited<T extends Record<string, unknown>>(
  ctx: Ctx,
  entity: Entity,
  id: number | string,
  patch: Record<string, unknown>,
  summary: string,
): Promise<T | null> {
  const db = await getDb();
  const table = ENTITIES[entity] as AnyTable;
  const [before] = (await db.select().from(table).where(eq(pk(entity), id))) as T[];
  if (!before) return null;
  const [after] = (await db.update(table).set(patch).where(eq(pk(entity), id)).returning()) as T[];
  await logAudit(ctx, { action: "update", entity, entityId: id, summary, before, after });
  return after;
}

/** Revert every change a chat command made, newest first. */
export async function undoCommand(commandId: number, ctx: Ctx): Promise<string[]> {
  const db = await getDb();
  const entries = await db
    .select()
    .from(s.auditLog)
    .where(and(eq(s.auditLog.commandId, commandId), inArray(s.auditLog.action, ["insert", "update"])))
    .orderBy(desc(s.auditLog.id));
  const done: string[] = [];
  for (const e of entries) {
    if (!(e.entity in ENTITIES)) continue;
    const entity = e.entity as Entity;
    const table = ENTITIES[entity] as AnyTable;
    const id = entity === "app_settings" ? e.entityId! : Number(e.entityId);
    if (e.action === "insert") {
      const [before] = await db.select().from(table).where(eq(pk(entity), id));
      await db.delete(table).where(eq(pk(entity), id));
      await logAudit(ctx, { action: "undo", entity, entityId: id, summary: `Undo: removed ${entity} #${id} (${e.summary})`, before, after: null });
    } else {
      const restore = { ...(e.before as Record<string, unknown>) };
      delete restore.id;
      for (const k of Object.keys(restore)) {
        // jsonb dates come back as strings: turn timestamp-looking fields back into Dates
        if (/At$/.test(k) && typeof restore[k] === "string") restore[k] = new Date(restore[k] as string);
      }
      const [cur] = await db.select().from(table).where(eq(pk(entity), id));
      await db.update(table).set(restore).where(eq(pk(entity), id));
      await logAudit(ctx, { action: "undo", entity, entityId: id, summary: `Undo: ${e.summary}`, before: cur, after: e.before });
    }
    done.push(e.summary);
  }
  await db.update(s.chatCommands).set({ status: "undone" }).where(eq(s.chatCommands.id, commandId));
  return done;
}
