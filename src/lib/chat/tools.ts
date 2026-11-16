import { and, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import { STAGES, type Stage } from "@/db/schema";
import type { Ctx } from "../audit";
import type { ToolDef } from "../llm";
import * as ops from "../ops";
import { buildAllPlans, buildPlan, writeAllReports } from "../planning";
import { pickResearcher, runResearchAgent, researchTick, STREAM_SLUGS } from "../research";
import { istDate, istDayStart, parseIst } from "../time";

type Args = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Tool = {
  description: string;
  parameters: Record<string, unknown>;
  mutates: boolean;
  /** Destructive or public actions wait for an explicit Confirm click. */
  confirm?: (a: Args) => boolean;
  describe?: (a: Args) => string;
  run: (a: Args, ctx: Ctx) => Promise<unknown>;
};

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required });
const int = { type: "integer" };
const str = { type: "string" };
const ids = { type: "array", items: int };
const ownerType = { type: "string", enum: ["agent", "manager"] };
const streamEnum = { type: "string", enum: STREAM_SLUGS };
const brandEnum = { type: "string", enum: ["ornate", "unityess", "both"] };

export const TOOLS: Record<string, Tool> = {
  list_team: {
    description: "List managers and agents (ids, status, quotas, focus). Optional stream slug filter.",
    parameters: obj({ stream: str }),
    mutates: false,
    run: async (a) => {
      const db = await getDb();
      const rows = await db
        .select({ mid: s.managers.id, manager: s.managers.name, mstatus: s.managers.status, mquota: s.managers.dailyQuota, stream: s.streams.slug })
        .from(s.managers)
        .innerJoin(s.streams, eq(s.managers.streamId, s.streams.id))
        .where(a.stream ? eq(s.streams.slug, a.stream) : undefined);
      const agents = await db.select().from(s.agents).where(inArray(s.agents.managerId, rows.map((r) => r.mid).concat(-1)));
      return Promise.all(
        rows.map(async (r) => ({
          ...r,
          focus: (await ops.activeFocus(r.mid))?.value ?? null,
          agents: agents.filter((x) => x.managerId === r.mid).map((x) => ({ id: x.id, name: x.name, status: x.status, quota: x.dailyQuota })),
        })),
      );
    },
  },
  set_status: {
    description: "Pause, resume (active) or retire an agent or manager. Nothing is ever deleted.",
    parameters: obj({ type: ownerType, id: int, status: { type: "string", enum: ["active", "paused", "retired"] } }, ["type", "id", "status"]),
    mutates: true,
    confirm: (a) => a.status === "retired",
    describe: (a) => `Retire ${a.type} #${a.id}`,
    run: (a, ctx) => ops.setStatus(ctx, a.type, a.id, a.status),
  },
  set_quota: {
    description: "Set the daily quota of an agent or a manager's team.",
    parameters: obj({ type: ownerType, id: int, daily_quota: int }, ["type", "id", "daily_quota"]),
    mutates: true,
    run: (a, ctx) => ops.setQuota(ctx, a.type, a.id, a.daily_quota),
  },
  set_focus: {
    description: "Point a manager at a theme, product, segment, region or campaign until a date. Its agents plan around it first.",
    parameters: obj({ manager_id: int, kind: { type: "string", enum: ["theme", "product", "segment", "region", "campaign"] }, value: str, until: { type: "string", description: "YYYY-MM-DD" } }, ["manager_id", "kind", "value", "until"]),
    mutates: true,
    run: (a, ctx) => ops.setFocus(ctx, a.manager_id, a.kind, a.value, a.until),
  },
  clear_focus: {
    description: "Remove a manager's current focus.",
    parameters: obj({ manager_id: int }, ["manager_id"]),
    mutates: true,
    run: (a, ctx) => ops.clearFocus(ctx, a.manager_id),
  },
  get_job_description: {
    description: "Read the current job description / prompt of an agent or manager, with its version.",
    parameters: obj({ type: ownerType, id: int }, ["type", "id"]),
    mutates: false,
    run: (a) => ops.currentJob(a.type, a.id),
  },
  update_job_description: {
    description: "Save a new version of an agent's or manager's job description. Always read the current one first and send the FULL new text. Old versions are kept.",
    parameters: obj({ type: ownerType, id: int, prompt: str, note: { type: "string", description: "what changed, a few words" } }, ["type", "id", "prompt"]),
    mutates: true,
    run: (a, ctx) => ops.saveJobDescription(ctx, a.type, a.id, a.prompt, a.note),
  },
  list_ideas: {
    description: "List ideas. status: waiting (default) | approved | rejected | all.",
    parameters: obj({ status: str, brand: str, stream: str, query: str, limit: int }),
    mutates: false,
    run: async (a) => {
      const db = await getDb();
      const conds = [];
      if (a.status !== "all") conds.push(eq(s.ideas.status, a.status ?? "waiting"));
      if (a.brand) conds.push(eq(s.ideas.brand, a.brand));
      if (a.stream) conds.push(sql`${s.ideas.streams} ? ${a.stream}`);
      if (a.query) conds.push(or(ilike(s.ideas.title, `%${a.query}%`), ilike(s.ideas.detail, `%${a.query}%`)));
      const rows = await db.select().from(s.ideas).where(and(...conds)).orderBy(desc(s.ideas.score), desc(s.ideas.id)).limit(Math.min(a.limit ?? 40, 80));
      return rows.map((r) => ({ id: r.id, title: r.title, brand: r.brand, streams: r.streams, why_now: r.whyNow, score: r.score, status: r.status, reject_reason: r.rejectReason }));
    },
  },
  decide_ideas: {
    description: "Approve or reject ideas. Approved ideas go into the right manager's pipeline (first suggested stream unless `stream` given). Rejections need a short reason so researchers learn.",
    parameters: obj({ ids, decision: { type: "string", enum: ["approve", "reject"] }, reason: str, stream: streamEnum }, ["ids", "decision"]),
    mutates: true,
    run: (a, ctx) => ops.decideIdeas(ctx, a.ids, a.decision, { reason: a.reason, stream: a.stream }),
  },
  edit_idea: {
    description: "Edit an idea's title, detail, why-now, streams or brand.",
    parameters: obj({ id: int, title: str, detail: str, why_now: str, streams: { type: "array", items: streamEnum }, brand: brandEnum }, ["id"]),
    mutates: true,
    run: (a, ctx) => ops.editIdea(ctx, a.id, { title: a.title, detail: a.detail, whyNow: a.why_now, streams: a.streams, brand: a.brand }),
  },
  generate_ideas: {
    description: "Have a research agent search the news on a topic, write `count` ideas, and add the best `add_best` to the Ideas list (de-duplicated). Returns all of them.",
    parameters: obj({ topic: str, count: int, add_best: int }, ["topic"]),
    mutates: true,
    run: async (a, ctx) => {
      const r = await pickResearcher(a.topic);
      const res = await runResearchAgent(r.id, { topic: a.topic, count: a.count ?? 10, maxAdd: a.add_best ?? a.count ?? 10, ctx });
      return { summary: `${res.agent}: ${res.generated.length} ideas on “${a.topic}”, added ${res.addedIds.length}`, ...res };
    },
  },
  add_idea: {
    description: "Add one idea to the Ideas list directly.",
    parameters: obj({ title: str, detail: str, why_now: str, streams: { type: "array", items: streamEnum }, brand: brandEnum }, ["title", "brand"]),
    mutates: true,
    run: async (a, ctx) => {
      const { insertAudited } = await import("../audit");
      const row = await insertAudited<{ id: number }>(ctx, "ideas", { title: a.title, detail: a.detail ?? "", whyNow: a.why_now ?? "", streams: a.streams ?? ["linkedin-company"], brand: a.brand, score: 60 }, `New idea: ${a.title}`);
      return `Added idea #${row.id}`;
    },
  },
  list_items: {
    description: `List content items. stage one of ${STAGES.join(", ")}. Use query to find by title words.`,
    parameters: obj({ stream: streamEnum, stage: str, brand: str, query: str, limit: int }),
    mutates: false,
    run: async (a) => {
      const db = await getDb();
      const conds = [];
      if (a.stream) conds.push(eq(s.streams.slug, a.stream));
      if (a.stage) conds.push(eq(s.contentItems.stage, a.stage));
      if (a.brand) conds.push(eq(s.contentItems.brand, a.brand));
      if (a.query) conds.push(ilike(s.contentItems.title, `%${a.query}%`));
      const rows = await db
        .select({ id: s.contentItems.id, title: s.contentItems.title, stage: s.contentItems.stage, stream: s.streams.slug, brand: s.contentItems.brand, language: s.contentItems.language, scheduledAt: s.contentItems.scheduledAt, dueDate: s.contentItems.dueDate })
        .from(s.contentItems)
        .innerJoin(s.streams, eq(s.contentItems.streamId, s.streams.id))
        .where(and(...conds))
        .orderBy(desc(s.contentItems.id))
        .limit(Math.min(a.limit ?? 30, 80));
      return rows;
    },
  },
  create_items: {
    description: "Request new content: adds one approved item per title to a stream's pipeline so its manager plans it. Write distinct, specific titles yourself. Use parent_id for a language version or a re-cut of another item.",
    parameters: obj({ stream: streamEnum, titles: { type: "array", items: str }, brand: { type: "string", enum: ["ornate", "unityess"] }, format: str, language: str, due_date: { type: "string", description: "YYYY-MM-DD" }, brief: str, parent_id: int }, ["stream", "titles", "brand"]),
    mutates: true,
    run: async (a, ctx) => (await ops.createItems(ctx, { stream: a.stream, titles: a.titles, brand: a.brand, format: a.format, language: a.language, dueDate: a.due_date, brief: a.brief, parentId: a.parent_id })).summary,
  },
  approve_items: {
    description: "Fateh approves content items (records the approval; moves them on).",
    parameters: obj({ ids, comment: str }, ["ids"]),
    mutates: true,
    run: (a, ctx) => ops.approveItems(ctx, a.ids, a.comment),
  },
  send_back_items: {
    description: "Reject / send items back to drafting with feedback.",
    parameters: obj({ ids, feedback: str }, ["ids", "feedback"]),
    mutates: true,
    run: (a, ctx) => ops.rejectItems(ctx, a.ids, a.feedback),
  },
  schedule_items: {
    description: "Set publish date/time (India time) for items, e.g. at '2026-11-17 10:00'.",
    parameters: obj({ schedule: { type: "array", items: obj({ id: int, at: str }, ["id", "at"]) } }, ["schedule"]),
    mutates: true,
    run: (a, ctx) => ops.scheduleItems(ctx, (a.schedule as { id: number; at: string }[]).map((x) => ({ id: x.id, at: parseIst(x.at) }))),
  },
  move_items: {
    description: "Move items to a pipeline stage.",
    parameters: obj({ ids, stage: { type: "string", enum: [...STAGES] } }, ["ids", "stage"]),
    mutates: true,
    run: (a, ctx) => ops.moveItems(ctx, a.ids, a.stage as Stage),
  },
  update_item: {
    description: "Edit a content item: title, body (saved as a new version), brief, language, due date.",
    parameters: obj({ id: int, title: str, body: str, brief: str, language: str, due_date: str }, ["id"]),
    mutates: true,
    run: (a, ctx) => ops.updateItem(ctx, a.id, { title: a.title, body: a.body, brief: a.brief, language: a.language, dueDate: a.due_date }),
  },
  mark_published: {
    description: "Mark an approved item as published (after export / manual posting). Requires an approval on record.",
    parameters: obj({ id: int, url: str, channel: { type: "string", enum: ["linkedin", "meta", "youtube", "email", "whatsapp", "cms"] } }, ["id"]),
    mutates: true,
    confirm: () => true,
    describe: (a) => `Publish item #${a.id}${a.channel ? ` on ${a.channel}` : ""}`,
    run: (a, ctx) => ops.markPublished(ctx, a.id, a.url, a.channel),
  },
  list_facts: {
    description: "List the Brand facts library.",
    parameters: obj({ status: str }),
    mutates: false,
    run: async (a) => {
      const db = await getDb();
      return db.select().from(s.brandFacts).where(a.status ? eq(s.brandFacts.status, a.status) : undefined);
    },
  },
  add_brand_fact: {
    description: "Add a fact to the Brand facts library. approve=true only when Fateh states the fact directly in chat.",
    parameters: obj({ brand: brandEnum, category: { type: "string", enum: ["credential", "number", "product", "customer", "other"] }, statement: str, source: str, approve: { type: "boolean" } }, ["brand", "category", "statement"]),
    mutates: true,
    run: (a, ctx) => ops.addFact(ctx, { brand: a.brand, category: a.category, statement: a.statement, source: a.source ?? "Chat", approve: !!a.approve }),
  },
  set_fact_status: {
    description: "Approve, unapprove (pending) or retire a brand fact.",
    parameters: obj({ id: int, status: { type: "string", enum: ["approved", "pending", "retired"] } }, ["id", "status"]),
    mutates: true,
    run: (a, ctx) => ops.setFactStatus(ctx, a.id, a.status),
  },
  run_now: {
    description: "Wake agents now: 'plans' (rebuild today's plan; manager_id optional), 'research' (top up Ideas to 30–40), 'reports' (write end-of-day reports and send the summary).",
    parameters: obj({ what: { type: "string", enum: ["plans", "research", "reports"] }, manager_id: int }, ["what"]),
    mutates: false,
    run: async (a) => {
      if (a.what === "plans") return a.manager_id ? buildPlan(a.manager_id, { force: true }) : buildAllPlans({ force: true });
      if (a.what === "research") return researchTick();
      const r = await writeAllReports();
      return `Reports written for ${r.managers} managers; delivered to ${r.delivered.join(", ") || "nowhere (webhook/email not configured)"}`;
    },
  },
  get_activity: {
    description: "Answer questions about what was made / approved / published, per stream and agent, in a date range (default last 7 days). Also returns today's plans and waiting counts.",
    parameters: obj({ from: { type: "string", description: "YYYY-MM-DD" }, to: { type: "string", description: "YYYY-MM-DD" }, stream: streamEnum }),
    mutates: false,
    run: async (a) => {
      const db = await getDb();
      const from = istDayStart(a.from ?? istDate(-6));
      const to = istDayStart(istDate(1, istDayStart(a.to ?? istDate())));
      const streamCond = a.stream ? eq(s.streams.slug, a.stream) : undefined;
      const items = await db
        .select({ id: s.contentItems.id, title: s.contentItems.title, stage: s.contentItems.stage, stream: s.streams.slug, publishedAt: s.contentItems.publishedAt, createdAt: s.contentItems.createdAt })
        .from(s.contentItems)
        .innerJoin(s.streams, eq(s.contentItems.streamId, s.streams.id))
        .where(and(streamCond, or(and(gte(s.contentItems.createdAt, from), lte(s.contentItems.createdAt, to)), and(gte(s.contentItems.publishedAt, from), lte(s.contentItems.publishedAt, to)))))
        .limit(200);
      const ideas = await db.select({ status: s.ideas.status, n: sql<number>`count(*)::int` }).from(s.ideas).where(and(gte(s.ideas.createdAt, from), lte(s.ideas.createdAt, to))).groupBy(s.ideas.status);
      const metrics = await db
        .select({ itemId: s.publications.itemId, impressions: sql<number>`sum(${s.metrics.impressions})::int`, engagements: sql<number>`sum(${s.metrics.engagements})::int`, clicks: sql<number>`sum(${s.metrics.clicks})::int`, leads: sql<number>`sum(${s.metrics.leads})::int` })
        .from(s.metrics)
        .innerJoin(s.publications, eq(s.metrics.publicationId, s.publications.id))
        .groupBy(s.publications.itemId);
      const runs = await db.select({ summary: s.agentRuns.summary, kind: s.agentRuns.kind, status: s.agentRuns.status, at: s.agentRuns.startedAt }).from(s.agentRuns).where(gte(s.agentRuns.startedAt, from)).orderBy(desc(s.agentRuns.id)).limit(30);
      return { range: [a.from ?? istDate(-6), a.to ?? istDate()], items, ideas, metrics_by_item: metrics, note: metrics.length ? undefined : "No performance data yet: metrics arrive once publishing connectors are live (phase 5).", recent_runs: runs };
    },
  },
  set_ai_model: {
    description: "Change which AI model is used for chat, planning, research or writing (no deploy needed).",
    parameters: obj({ purpose: { type: "string", enum: ["chat", "planning", "research", "writing"] }, model: str, temperature: { type: "number" } }, ["purpose", "model"]),
    mutates: true,
    run: (a, ctx) => ops.setLlmModel(ctx, a.purpose, a.model, "groq", a.temperature),
  },
  set_setting: {
    description: "Change a portal setting: instinct_webhook_url, report_email_to, video_daily_budget_inr, video_languages.",
    parameters: obj({ key: { type: "string", enum: ["instinct_webhook_url", "report_email_to", "video_daily_budget_inr", "video_languages"] }, value: {} }, ["key", "value"]),
    mutates: true,
    run: (a, ctx) => ops.setSetting(ctx, a.key, a.value),
  },
  search_audit: {
    description: "Search the audit log (who changed what).",
    parameters: obj({ query: str, limit: int }),
    mutates: false,
    run: async (a) => {
      const db = await getDb();
      return db
        .select({ at: s.auditLog.at, who: s.auditLog.actorName, what: s.auditLog.summary })
        .from(s.auditLog)
        .where(a.query ? or(ilike(s.auditLog.summary, `%${a.query}%`), ilike(s.auditLog.actorName, `%${a.query}%`)) : undefined)
        .orderBy(desc(s.auditLog.id))
        .limit(Math.min(a.limit ?? 20, 60));
    },
  },
};

export const TOOL_DEFS: ToolDef[] = Object.entries(TOOLS).map(([name, t]) => ({
  type: "function",
  function: { name, description: t.description, parameters: t.parameters },
}));
