import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import { logAudit } from "./audit";
import { HOUSE_RULES, LlmUnavailable, llmJson } from "./llm";
import { activeFocus, currentJob, getSetting } from "./ops";
import { researchTick } from "./research";
import { istDate, istDayStart, istHour } from "./time";

type PlanOut = { summary: string; items: { agent_id: number; title: string; why: string; brand?: string; content_item_id?: number }[] };

export async function buildPlan(managerId: number, opts: { force?: boolean; actor?: string } = {}) {
  const db = await getDb();
  const today = istDate();
  const [m] = await db.select().from(s.managers).where(eq(s.managers.id, managerId));
  if (!m) throw new Error(`No manager #${managerId}`);
  if (m.status !== "active") return `${m.name} is ${m.status}; no plan`;
  const [existing] = await db.select().from(s.workPlans).where(and(eq(s.workPlans.managerId, managerId), eq(s.workPlans.date, today)));
  if (existing && !opts.force) return `${m.name}: plan already made today`;
  if (existing) {
    await db.delete(s.planItems).where(eq(s.planItems.planId, existing.id));
    await db.delete(s.workPlans).where(eq(s.workPlans.id, existing.id));
  }

  const [stream] = await db.select().from(s.streams).where(eq(s.streams.id, m.streamId));
  const agents = await db.select().from(s.agents).where(and(eq(s.agents.managerId, managerId), eq(s.agents.status, "active")));
  if (!agents.length) return `${m.name}: no active agents`;
  const job = await currentJob("manager", managerId);
  const agentJobs = await Promise.all(agents.map(async (a) => ({ a, job: (await currentJob("agent", a.id))?.prompt ?? "" })));
  const focus = await activeFocus(managerId);
  const yesterday = istDate(-1);
  const [yReport] = await db.select().from(s.dailyReports).where(and(eq(s.dailyReports.managerId, managerId), eq(s.dailyReports.date, yesterday)));
  const backlog = await db
    .select()
    .from(s.contentItems)
    .where(and(eq(s.contentItems.streamId, m.streamId), inArray(s.contentItems.stage, ["approved_idea", "drafting"])))
    .orderBy(s.contentItems.dueDate, s.contentItems.id)
    .limit(30);
  const feedback = await db
    .select({ comment: s.approvals.comment, decision: s.approvals.decision, title: s.contentItems.title })
    .from(s.approvals)
    .innerJoin(s.contentItems, eq(s.approvals.subjectId, s.contentItems.id))
    .where(and(eq(s.approvals.subjectType, "item"), eq(s.contentItems.streamId, m.streamId), gte(s.approvals.createdAt, istDayStart(istDate(-3)))))
    .orderBy(desc(s.approvals.id))
    .limit(10);

  const started = new Date();
  let plan: PlanOut;
  let offline = false;
  try {
    plan = await llmJson<PlanOut>({
      purpose: "planning",
      actor: m.name,
      maxTokens: 3000,
      messages: [
        { role: "system", content: `${job?.prompt ?? ""}\n\n${HOUSE_RULES}\n\nReturn JSON only.` },
        {
          role: "user",
          content: `Today is ${today} (India). Build today's work plan for the ${stream.name} stream.
${focus ? `FOCUS (plan around this first): ${focus.kind} "${focus.value}" until ${focus.untilDate}.` : "No special focus."}
Yesterday's report: ${yReport ? `done: ${yReport.done}; stuck: ${yReport.stuck}; plan: ${yReport.tomorrow}` : "none"}
Recent feedback from Fateh: ${feedback.map((f) => `[${f.decision}] ${f.title}: ${f.comment ?? ""}`).join(" | ") || "none"}
Backlog (approved ideas / drafts waiting, use these first, by id):
${backlog.map((b) => `- item ${b.id} [${b.stage}] ${b.title} (${b.brand})${b.dueDate ? ` due ${b.dueDate}` : ""}`).join("\n") || "- empty"}
Your agents (id, name, daily quota, job):
${agentJobs.map(({ a, job }) => `- ${a.id} | ${a.name} | quota ${a.dailyQuota} | ${job.slice(0, 300)}`).join("\n")}
Team daily quota: ${m.dailyQuota}.

Return {"summary":"one or two sentences: today's priority and why","items":[{"agent_id":id,"title":"what to make","why":"one line","brand":"ornate|unityess","content_item_id":id or null}]} in the order they should be done. Respect each agent's quota and the team quota.`,
        },
      ],
    });
  } catch (e) {
    if (!(e instanceof LlmUnavailable) && !(e instanceof SyntaxError)) throw e;
    offline = true;
    const items: PlanOut["items"] = [];
    const queue = [...backlog];
    for (const { a } of agentJobs) {
      if (stream.kind === "ideas") {
        const q = ((a.config.queries as string[]) ?? []).slice(0, 2).join(", ");
        items.push({ agent_id: a.id, title: `Find up to ${a.dailyQuota} ideas${focus ? ` on ${focus.value}` : q ? ` (${q})` : ""}`, why: "Keep 30–40 fresh ideas waiting" });
        continue;
      }
      for (let i = 0; i < a.dailyQuota && items.length < m.dailyQuota; i++) {
        const b = queue.shift();
        items.push(
          b
            ? { agent_id: a.id, title: b.title, why: "Oldest approved item in the backlog", brand: b.brand, content_item_id: b.id }
            : { agent_id: a.id, title: focus ? `${stream.name} piece on ${focus.value}` : `${stream.name}: next piece from the idea list`, why: focus ? `Focus until ${focus.untilDate}` : "Keep the stream moving" },
        );
      }
    }
    plan = { summary: `Plan made without AI (AI offline): ${items.length} item(s) from the backlog${focus ? ` and the focus “${focus.value}”` : ""}.`, items };
  }

  // Validate and cap by quotas.
  const agentIds = new Set(agents.map((a) => a.id));
  const perAgent = new Map<number, number>();
  const items = (plan.items ?? []).filter((it) => {
    if (!agentIds.has(Number(it.agent_id)) || !it.title) return false;
    const a = agents.find((x) => x.id === Number(it.agent_id))!;
    const n = (perAgent.get(a.id) ?? 0) + 1;
    if (n > a.dailyQuota) return false;
    perAgent.set(a.id, n);
    return true;
  }).slice(0, stream.kind === "ideas" ? agents.length * 3 : Math.max(m.dailyQuota, 1));

  const [wp] = await db.insert(s.workPlans).values({ managerId, date: today, summary: plan.summary ?? "" }).returning();
  if (items.length) {
    await db.insert(s.planItems).values(
      items.map((it, i) => ({
        planId: wp.id,
        agentId: Number(it.agent_id),
        position: i + 1,
        title: it.title.slice(0, 300),
        why: it.why ?? "",
        brand: it.brand ?? null,
        contentItemId: it.content_item_id && backlog.some((b) => b.id === Number(it.content_item_id)) ? Number(it.content_item_id) : null,
      })),
    );
  }
  const summary = `Planned ${items.length} item(s) for today${focus ? ` (focus: ${focus.value})` : ""}${offline ? " — AI offline, simple plan" : ""}`;
  await db.insert(s.agentRuns).values({ managerId, kind: "plan", status: offline ? "skipped" : "ok", summary, startedAt: started, finishedAt: new Date() });
  await logAudit({ actorType: "manager", actorName: opts.actor ?? m.name }, { action: "plan", entity: "work_plans", entityId: wp.id, summary: `${m.name}: ${summary}`, after: { summary: plan.summary, items } });
  return `${m.name}: ${summary}`;
}

export async function buildAllPlans(opts: { force?: boolean; actor?: string } = {}) {
  const db = await getDb();
  const mgrs = await db.select().from(s.managers).where(eq(s.managers.status, "active"));
  const out: string[] = [];
  for (const m of mgrs) {
    try {
      out.push(await buildPlan(m.id, opts));
    } catch (e) {
      out.push(`${m.name}: plan failed (${(e as Error).message})`);
      await db.insert(s.agentRuns).values({ managerId: m.id, kind: "plan", status: "error", summary: (e as Error).message.slice(0, 300), finishedAt: new Date() });
    }
  }
  return out;
}

/* ---------- End-of-day reports ---------- */

type ReportOut = { done: string; results: string; stuck: string; tomorrow: string; agent_lines?: { agent: string; line: string }[] };

async function managerDayFacts(managerId: number, date: string) {
  const db = await getDb();
  const [m] = await db.select().from(s.managers).where(eq(s.managers.id, managerId));
  const start = istDayStart(date);
  const end = istDayStart(istDate(1, start));
  const [plan] = await db.select().from(s.workPlans).where(and(eq(s.workPlans.managerId, managerId), eq(s.workPlans.date, date)));
  const planItems = plan ? await db.select().from(s.planItems).where(eq(s.planItems.planId, plan.id)) : [];
  const runs = await db.select().from(s.agentRuns).where(and(eq(s.agentRuns.managerId, managerId), gte(s.agentRuns.startedAt, start), sql`${s.agentRuns.startedAt} < ${end}`));
  const agents = await db.select().from(s.agents).where(eq(s.agents.managerId, managerId));
  const made = await db.select({ n: sql<number>`count(*)::int` }).from(s.contentItems).where(and(eq(s.contentItems.streamId, m.streamId), gte(s.contentItems.createdAt, start), sql`${s.contentItems.createdAt} < ${end}`));
  const ideasAdded = await db.select({ n: sql<number>`count(*)::int` }).from(s.ideas).where(and(inArray(s.ideas.agentId, agents.map((a) => a.id).concat(-1)), gte(s.ideas.createdAt, start), sql`${s.ideas.createdAt} < ${end}`));
  const published = await db.select({ n: sql<number>`count(*)::int` }).from(s.contentItems).where(and(eq(s.contentItems.streamId, m.streamId), gte(s.contentItems.publishedAt, start), sql`${s.contentItems.publishedAt} < ${end}`));
  const stuck = await db.select({ id: s.contentItems.id, title: s.contentItems.title, stage: s.contentItems.stage }).from(s.contentItems).where(and(eq(s.contentItems.streamId, m.streamId), inArray(s.contentItems.stage, ["drafting", "in_review"]), sql`${s.contentItems.stageChangedAt} < ${new Date(Date.now() - 48 * 3600 * 1000)}`));
  return { m, plan, planItems, runs, agents, made: made[0].n, ideasAdded: ideasAdded[0].n, published: published[0].n, stuck };
}

export async function writeManagerReport(managerId: number, date = istDate()) {
  const db = await getDb();
  const f = await managerDayFacts(managerId, date);
  const agentLines = f.agents.filter((a) => a.status === "active").map((a) => {
    const rs = f.runs.filter((r) => r.agentId === a.id);
    const pi = f.planItems.filter((p) => p.agentId === a.id);
    return { agent: a.name, line: rs.length ? rs.map((r) => r.summary).join("; ") : pi.length ? `${pi.filter((p) => p.status === "done").length}/${pi.length} planned items done` : "No work today" };
  });
  const factsText = `Plan: ${f.plan?.summary ?? "no plan"}; ${f.planItems.length} planned, ${f.planItems.filter((p) => p.status === "done").length} done.
New items: ${f.made}. Ideas added: ${f.ideasAdded}. Published: ${f.published}.
Stuck >48h: ${f.stuck.map((x) => `#${x.id} ${x.title} (${x.stage})`).join(", ") || "none"}.
Runs: ${f.runs.map((r) => `[${r.status}] ${r.summary}`).join(" | ") || "none"}.`;
  let rep: ReportOut;
  try {
    rep = await llmJson<ReportOut>({
      purpose: "planning",
      actor: f.m.name,
      maxTokens: 800,
      messages: [
        { role: "system", content: `You are ${f.m.name}. Write your end-of-day report to Fateh. Be short and specific; one or two lines per field; only use the facts given. Return JSON.` },
        { role: "user", content: `${factsText}\nReturn {"done":"","results":"","stuck":"","tomorrow":""}` },
      ],
    });
  } catch (e) {
    if (!(e instanceof LlmUnavailable) && !(e instanceof SyntaxError)) throw e;
    rep = {
      done: `${f.planItems.filter((p) => p.status === "done").length}/${f.planItems.length} planned items done; ${f.made} new item(s); ${f.ideasAdded} idea(s) added.`,
      results: `${f.published} published.`,
      stuck: f.stuck.map((x) => `#${x.id} ${x.title}`).join(", ") || "Nothing stuck.",
      tomorrow: "Continue the backlog in order.",
    };
  }
  await db.delete(s.dailyReports).where(and(eq(s.dailyReports.managerId, managerId), eq(s.dailyReports.date, date)));
  const [row] = await db.insert(s.dailyReports).values({ managerId, date, done: rep.done ?? "", results: rep.results ?? "", stuck: rep.stuck ?? "", tomorrow: rep.tomorrow ?? "", agentLines }).returning();
  await db.insert(s.agentRuns).values({ managerId, kind: "report", summary: `End-of-day report for ${date}`, finishedAt: new Date() });
  return row;
}

export async function writeAllReports(date = istDate()) {
  const db = await getDb();
  const mgrs = await db.select().from(s.managers).where(eq(s.managers.status, "active"));
  const reports = [];
  for (const m of mgrs) reports.push({ m, r: await writeManagerReport(m.id, date) });

  let head: ReportOut;
  const text = reports.map(({ m, r }) => `${m.name}: done ${r.done} | results ${r.results} | stuck ${r.stuck} | tomorrow ${r.tomorrow}`).join("\n");
  try {
    head = await llmJson<ReportOut>({
      purpose: "planning",
      actor: "Head summary",
      maxTokens: 1000,
      messages: [
        { role: "system", content: "Summarise the marketing team's day for Fateh (Head of Marketing) in plain language. Lead with what needs Fateh's decision. Short. Only use the facts given. Return JSON." },
        { role: "user", content: `${text}\nReturn {"done":"","results":"","stuck":"","tomorrow":""}` },
      ],
    });
  } catch (e) {
    if (!(e instanceof LlmUnavailable) && !(e instanceof SyntaxError)) throw e;
    head = { done: reports.map(({ m, r }) => `${m.name}: ${r.done}`).join("\n"), results: "", stuck: reports.filter(({ r }) => !/^Nothing stuck/.test(r.stuck)).map(({ m, r }) => `${m.name}: ${r.stuck}`).join("\n") || "Nothing stuck.", tomorrow: "" };
  }
  await db.delete(s.dailyReports).where(and(isNull(s.dailyReports.managerId), eq(s.dailyReports.date, date)));
  const [headRow] = await db.insert(s.dailyReports).values({ managerId: null, date, done: head.done ?? "", results: head.results ?? "", stuck: head.stuck ?? "", tomorrow: head.tomorrow ?? "" }).returning();
  const delivered = await deliverHeadSummary(headRow, reports.map(({ m, r }) => ({ manager: m.name, ...r })));
  await db.update(s.dailyReports).set({ deliveredTo: delivered }).where(eq(s.dailyReports.id, headRow.id));
  await logAudit({ actorType: "system", actorName: "Daily reports" }, { action: "report", entity: "daily_reports", entityId: headRow.id, summary: `Daily reports written for ${date}; delivered to ${delivered.join(", ") || "nowhere (not configured)"}` });
  return { head: headRow, delivered, managers: reports.length };
}

async function deliverHeadSummary(head: typeof s.dailyReports.$inferSelect, managers: unknown[]) {
  const delivered: string[] = [];
  const hook = process.env.INSTINCT_WEBHOOK_URL || (await getSetting<string>("instinct_webhook_url", ""));
  if (hook) {
    try {
      const res = await fetch(hook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: "ornate-marketing-os", type: "daily_summary", date: head.date, summary: head, managers }),
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) delivered.push("Instinct");
    } catch {
      /* recorded as not delivered */
    }
  }
  const to = process.env.REPORT_EMAIL_TO || (await getSetting<string>("report_email_to", ""));
  if (to && process.env.RESEND_API_KEY) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${process.env.RESEND_API_KEY}` },
        body: JSON.stringify({
          from: process.env.REPORT_EMAIL_FROM || "Marketing OS <reports@ornatesolar.com>",
          to: to.split(","),
          subject: `Marketing daily summary — ${head.date}`,
          text: `Done:\n${head.done}\n\nResults:\n${head.results}\n\nStuck:\n${head.stuck}\n\nTomorrow:\n${head.tomorrow}`,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) delivered.push("email");
    } catch {
      /* not delivered */
    }
  }
  return delivered;
}

/* ---------- Cron tick (every 30 min) ---------- */

export async function tick(now = new Date()) {
  const db = await getDb();
  const out: string[] = [];
  const today = istDate(0, now);
  const hour = istHour(now);
  if (hour >= 7) {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.workPlans).where(eq(s.workPlans.date, today));
    if (n === 0) out.push(...(await buildAllPlans({ actor: "Morning planning" })));
  }
  if (hour >= 6 && hour < 22) out.push(await researchTick());
  if (hour >= 19) {
    const [head] = await db.select().from(s.dailyReports).where(and(isNull(s.dailyReports.managerId), eq(s.dailyReports.date, today)));
    if (!head) {
      const r = await writeAllReports(today);
      out.push(`Reports written for ${r.managers} managers; summary delivered to ${r.delivered.join(", ") || "nowhere yet"}`);
    }
  }
  return out;
}
