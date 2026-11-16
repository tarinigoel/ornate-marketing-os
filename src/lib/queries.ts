import { and, asc, desc, eq, gte, inArray, isNull, isNotNull, lt, sql } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import { STAGES } from "@/db/schema";
import { activeFocus } from "./ops";
import { istDate, istDateOf, istDayStart } from "./time";

export async function streamsWithManagers() {
  const db = await getDb();
  return db
    .select({ stream: s.streams, manager: s.managers })
    .from(s.streams)
    .innerJoin(s.managers, eq(s.managers.streamId, s.streams.id))
    .orderBy(asc(s.streams.sortOrder));
}

export async function pipelineCounts() {
  const db = await getDb();
  const rows = await db
    .select({ streamId: s.contentItems.streamId, stage: s.contentItems.stage, n: sql<number>`count(*)::int` })
    .from(s.contentItems)
    .groupBy(s.contentItems.streamId, s.contentItems.stage);
  const map = new Map<number, Record<string, number>>();
  for (const r of rows) {
    const m = map.get(r.streamId) ?? {};
    m[r.stage] = r.n;
    map.set(r.streamId, m);
  }
  return map;
}

export async function overview() {
  const db = await getDb();
  const today = istDate();
  const start = istDayStart(today);
  const end = istDayStart(istDate(1));

  const [{ n: waitingIdeas }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.ideas).where(eq(s.ideas.status, "waiting"));
  const topIdeas = await db.select().from(s.ideas).where(eq(s.ideas.status, "waiting")).orderBy(desc(s.ideas.score), desc(s.ideas.id)).limit(3);
  const itemCols = { id: s.contentItems.id, title: s.contentItems.title, stage: s.contentItems.stage, brand: s.contentItems.brand, scheduledAt: s.contentItems.scheduledAt, stageChangedAt: s.contentItems.stageChangedAt, hasNumbers: s.contentItems.hasNumbers, stream: s.streams.name, streamSlug: s.streams.slug };
  const waitingItems = await db.select(itemCols).from(s.contentItems).innerJoin(s.streams, eq(s.contentItems.streamId, s.streams.id)).where(eq(s.contentItems.stage, "waiting_for_me")).orderBy(asc(s.contentItems.stageChangedAt)).limit(20);
  const dueToday = await db.select(itemCols).from(s.contentItems).innerJoin(s.streams, eq(s.contentItems.streamId, s.streams.id)).where(and(gte(s.contentItems.scheduledAt, start), lt(s.contentItems.scheduledAt, end), inArray(s.contentItems.stage, ["scheduled", "waiting_for_me", "in_review", "drafting", "approved_idea"]))).orderBy(asc(s.contentItems.scheduledAt));
  const stuckItems = await db.select(itemCols).from(s.contentItems).innerJoin(s.streams, eq(s.contentItems.streamId, s.streams.id)).where(and(inArray(s.contentItems.stage, ["drafting", "in_review"]), lt(s.contentItems.stageChangedAt, new Date(Date.now() - 48 * 3600 * 1000)))).limit(10);
  const failedRuns = await db
    .select({ id: s.agentRuns.id, summary: s.agentRuns.summary, agentId: s.agentRuns.agentId, managerId: s.agentRuns.managerId, kind: s.agentRuns.kind, at: s.agentRuns.startedAt })
    .from(s.agentRuns)
    .where(and(eq(s.agentRuns.status, "error"), gte(s.agentRuns.startedAt, start)))
    .orderBy(desc(s.agentRuns.id))
    .limit(5);

  // Today so far
  const [{ n: madeItems }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.contentItems).where(gte(s.contentItems.createdAt, start));
  const [{ n: madeIdeas }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.ideas).where(gte(s.ideas.createdAt, start));
  const [{ n: approvedToday }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.approvals).where(and(gte(s.approvals.createdAt, start), eq(s.approvals.decision, "approved"), eq(s.approvals.level, "head")));
  const [{ n: publishedToday }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.contentItems).where(gte(s.contentItems.publishedAt, start));
  const [{ n: inProgress }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.contentItems).where(inArray(s.contentItems.stage, ["drafting", "in_review"]));
  const feedback = await db
    .select({ comment: s.approvals.comment, decision: s.approvals.decision, subjectType: s.approvals.subjectType, subjectId: s.approvals.subjectId, by: s.approvals.decidedBy, at: s.approvals.createdAt })
    .from(s.approvals)
    .where(isNotNull(s.approvals.comment))
    .orderBy(desc(s.approvals.id))
    .limit(3);

  // Manager cards
  const sm = await streamsWithManagers();
  const pipes = await pipelineCounts();
  const plans = await db.select().from(s.workPlans).where(eq(s.workPlans.date, today));
  const planItems = plans.length ? await db.select().from(s.planItems).where(inArray(s.planItems.planId, plans.map((p) => p.id))) : [];
  const agentsRows = await db.select().from(s.agents);
  const runsToday = await db.select({ agentId: s.agentRuns.agentId, managerId: s.agentRuns.managerId, kind: s.agentRuns.kind, summary: s.agentRuns.summary }).from(s.agentRuns).where(gte(s.agentRuns.startedAt, start));
  const reports = await db.select().from(s.dailyReports).where(eq(s.dailyReports.date, today));
  const managers = await Promise.all(
    sm.map(async ({ stream, manager }) => {
      const plan = plans.find((p) => p.managerId === manager.id);
      const items = planItems.filter((p) => p.planId === plan?.id);
      const agents = agentsRows.filter((a) => a.managerId === manager.id);
      return {
        stream,
        manager,
        focus: await activeFocus(manager.id),
        plan,
        planned: items.length,
        done: items.filter((i) => i.status === "done").length,
        pipeline: pipes.get(stream.id) ?? {},
        activeAgents: agents.filter((a) => a.status === "active").length,
        totalAgents: agents.length,
        runsToday: runsToday.filter((r) => r.managerId === manager.id).length,
        report: reports.find((r) => r.managerId === manager.id),
      };
    }),
  );

  // 7-day chart
  const from7 = istDayStart(istDate(-6));
  const series = async (table: typeof s.ideas | typeof s.contentItems | typeof s.approvals, col: ReturnType<typeof sql>, where?: ReturnType<typeof and>) => {
    const rows = await db
      .select({ d: sql<string>`to_char(${col} at time zone 'Asia/Kolkata', 'YYYY-MM-DD')`, n: sql<number>`count(*)::int` })
      .from(table as typeof s.ideas)
      .where(and(sql`${col} >= ${from7}`, where))
      .groupBy(sql`1`);
    return new Map(rows.map((r) => [r.d, r.n]));
  };
  const ideasBy = await series(s.ideas, sql`${s.ideas.createdAt}`);
  const itemsBy = await series(s.contentItems, sql`${s.contentItems.createdAt}`);
  const apprBy = await series(s.approvals, sql`${s.approvals.createdAt}`, and(eq(s.approvals.decision, "approved"), eq(s.approvals.level, "head")));
  const pubBy = await series(s.contentItems, sql`${s.contentItems.publishedAt}`);
  const days = Array.from({ length: 7 }, (_, i) => istDate(i - 6));
  const week = days.map((d) => ({ date: d, ideas: ideasBy.get(d) ?? 0, items: itemsBy.get(d) ?? 0, approved: apprBy.get(d) ?? 0, published: pubBy.get(d) ?? 0 }));

  // 14-day calendar
  const calRows = await db.select(itemCols).from(s.contentItems).innerJoin(s.streams, eq(s.contentItems.streamId, s.streams.id)).where(and(gte(s.contentItems.scheduledAt, start), lt(s.contentItems.scheduledAt, istDayStart(istDate(14))))).orderBy(asc(s.contentItems.scheduledAt));
  const calendar = Array.from({ length: 14 }, (_, i) => istDate(i)).map((d) => ({ date: d, items: calRows.filter((r) => istDateOf(r.scheduledAt) === d) }));

  const [headReport] = await db.select().from(s.dailyReports).where(isNull(s.dailyReports.managerId)).orderBy(desc(s.dailyReports.id)).limit(1);

  return {
    today,
    waitingIdeas,
    topIdeas,
    waitingItems,
    dueToday,
    stuckItems,
    failedRuns,
    soFar: { madeItems, madeIdeas, approvedToday, publishedToday, inProgress, feedback },
    managers,
    week,
    calendar,
    headReport,
    agentNames: new Map(agentsRows.map((a) => [a.id, a.name])),
  };
}

export async function streamPage(slug: string) {
  const db = await getDb();
  const [stream] = await db.select().from(s.streams).where(eq(s.streams.slug, slug));
  if (!stream) return null;
  const [manager] = await db.select().from(s.managers).where(eq(s.managers.streamId, stream.id));
  const items = await db.select().from(s.contentItems).where(eq(s.contentItems.streamId, stream.id)).orderBy(desc(s.contentItems.id)).limit(300);
  const agents = await db.select().from(s.agents).where(eq(s.agents.managerId, manager.id));
  const focus = await activeFocus(manager.id);
  const [plan] = await db.select().from(s.workPlans).where(and(eq(s.workPlans.managerId, manager.id), eq(s.workPlans.date, istDate())));
  const planItems = plan ? await db.select().from(s.planItems).where(eq(s.planItems.planId, plan.id)).orderBy(asc(s.planItems.position)) : [];
  const columns = STAGES.map((st) => ({ stage: st, items: items.filter((i) => i.stage === st) }));
  return { stream, manager, agents, focus, plan, planItems, columns, items };
}

export async function itemHistory(itemId: number) {
  const db = await getDb();
  return db.select().from(s.auditLog).where(and(eq(s.auditLog.entity, "content_items"), eq(s.auditLog.entityId, String(itemId)))).orderBy(desc(s.auditLog.id)).limit(30);
}
