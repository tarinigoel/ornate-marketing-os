import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import type { SourceLink } from "@/db/schema";
import { type Ctx, insertAudited } from "./audit";
import { HOUSE_RULES, LlmUnavailable, llmJson } from "./llm";
import { activeFocus, approvedFacts, currentJob } from "./ops";
import { istDate, istDayStart } from "./time";

export const IDEA_TARGET_MIN = 30;
export const IDEA_TARGET_MAX = 40;

export const STREAM_SLUGS = [
  "linkedin-company",
  "linkedin-leadership",
  "instagram",
  "blogs",
  "white-papers",
  "case-studies",
  "emailers",
  "short-videos",
  "interviews",
  "brochures",
  "pr",
  "video-studio",
];

type Headline = { title: string; url: string; source: string; date: string };

function decode(x: string) {
  return x
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();
}

export async function fetchNews(query: string, max = 8): Promise<Headline[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query + " when:14d")}&hl=en-IN&gl=IN&ceid=IN:en`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { "user-agent": "Mozilla/5.0 (compatible; MarketingOS/1.0)" } });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = xml.split("<item>").slice(1, max + 1);
    return items.map((it) => {
      const get = (tag: string) => decode(it.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1] ?? "");
      return { title: get("title"), url: get("link"), source: get("source"), date: get("pubDate") };
    }).filter((h) => h.title && h.url);
  } catch {
    return [];
  }
}

const STOP = new Set("a an the and or of for to in on with how why what is are your our you we it its this that from by at as be can will india indian new".split(" "));
export function words(t: string) {
  return new Set(t.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
}
export function fingerprint(t: string) {
  return [...words(t)].sort().join(" ");
}
export function similarity(a: string, b: string) {
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

type RawIdea = { title: string; detail?: string; streams?: string[]; why_now?: string; brand?: string; sources?: number[]; score?: number };

export type ResearchResult = {
  agent: string;
  headlines: number;
  generated: { title: string; added: boolean; id?: number; reason?: string; score: number }[];
  addedIds: number[];
  offline: boolean;
};

export async function runResearchAgent(agentId: number, opts: { topic?: string; count?: number; maxAdd?: number; ctx?: Ctx } = {}): Promise<ResearchResult> {
  const db = await getDb();
  const [agent] = await db.select().from(s.agents).where(eq(s.agents.id, agentId));
  if (!agent) throw new Error(`No agent #${agentId}`);
  const ctx: Ctx = opts.ctx ?? { actorType: "agent", actorName: agent.name };
  const started = new Date();

  // 1. What to search: the topic asked for, else the agent's own queries plus any active focus.
  const focus = await activeFocus(agent.managerId);
  let queries = ((agent.config.queries as string[]) ?? []).slice();
  if (focus) queries.unshift(focus.value);
  if (opts.topic) queries = [opts.topic, `${opts.topic} India`];
  const seen = new Set<string>();
  const headlines: Headline[] = [];
  for (const q of queries.slice(0, 5)) {
    for (const h of await fetchNews(q, 6)) {
      if (seen.has(h.url)) continue;
      seen.add(h.url);
      headlines.push(h);
    }
  }

  // 2. Memory: what was rejected (and why), and what already exists.
  const rejected = await db.select({ title: s.ideas.title, reason: s.ideas.rejectReason }).from(s.ideas).where(eq(s.ideas.status, "rejected")).orderBy(desc(s.ideas.decidedAt)).limit(20);
  const existing = await db.select({ id: s.ideas.id, title: s.ideas.title, sources: s.ideas.sources }).from(s.ideas).orderBy(desc(s.ideas.id)).limit(1000);
  const facts = await approvedFacts();
  const job = await currentJob("agent", agentId);
  const count = Math.min(opts.count ?? 6, 25);

  let raw: RawIdea[] = [];
  let offline = false;
  try {
    const out = await llmJson<{ ideas: RawIdea[] }>({
      purpose: "research",
      actor: agent.name,
      maxTokens: 4000,
      messages: [
        {
          role: "system",
          content: `${job?.prompt ?? ""}\n\n${HOUSE_RULES}\n\nApproved brand facts:\n${facts.map((f) => `- [${f.brand}] ${f.statement}`).join("\n")}\n\nYou suggest content ideas for Fateh's marketing team. Return JSON only.`,
        },
        {
          role: "user",
          content: `Today is ${istDate()} (India).${opts.topic ? ` Topic asked for: "${opts.topic}".` : ""}${focus ? ` Current focus: ${focus.kind} "${focus.value}" until ${focus.untilDate}.` : ""}

Recent headlines (index: title — source):
${headlines.map((h, i) => `${i}: ${h.title} — ${h.source}`).join("\n") || "(none found; use your knowledge of evergreen topics, with no source)"}

Do NOT suggest anything like these rejected ideas (reason in brackets):
${rejected.map((r) => `- ${r.title} [${r.reason ?? "no reason"}]`).join("\n") || "- none yet"}

Avoid repeating these existing ideas:
${existing.slice(0, 60).map((e) => `- ${e.title}`).join("\n") || "- none yet"}

Give ${count} distinct ideas. JSON shape:
{"ideas":[{"title":"one-line idea, max 110 chars","detail":"2 sentences: the angle and the takeaway","streams":["one or more of: ${STREAM_SLUGS.join(", ")}"],"why_now":"one line, cite the headline if any","brand":"ornate|unityess|both","sources":[headline indexes used],"score":0-100 (expected impact)}]}`,
        },
      ],
    });
    raw = out.ideas ?? [];
  } catch (e) {
    if (!(e instanceof LlmUnavailable) && !(e instanceof SyntaxError)) throw e;
    offline = true;
    raw = headlines.slice(0, count).map((h, i) => ({
      title: `What "${h.title.replace(/ - [^-]+$/, "").slice(0, 80)}" means for our customers`,
      detail: "Drafted without AI (AI is offline). Edit or reject.",
      streams: ["linkedin-company"],
      why_now: `In the news: ${h.source}`,
      brand: /batter|storage|bess|lithium/i.test(h.title) ? "unityess" : "ornate",
      sources: [i],
      score: 40,
    }));
  }

  // 3. De-duplicate and add the best ones.
  raw.sort((a, b) => (b.score ?? 50) - (a.score ?? 50));
  const maxAdd = opts.maxAdd ?? raw.length;
  const generated: ResearchResult["generated"] = [];
  const addedIds: number[] = [];
  const pool = existing.map((e) => e.title);
  const usedUrls = new Set(existing.flatMap((e) => e.sources.map((x) => x.url)));
  for (const r of raw) {
    if (!r.title) continue;
    const score = Math.max(0, Math.min(100, Math.round(r.score ?? 50)));
    const dup = pool.find((t) => similarity(t, r.title) >= 0.5);
    const sources: SourceLink[] = (r.sources ?? []).map((i) => headlines[i]).filter(Boolean).map((h) => ({ title: `${h.title}`, url: h.url }));
    if (dup) {
      generated.push({ title: r.title, added: false, reason: `duplicate of “${dup}”`, score });
      continue;
    }
    if (sources.length && sources.every((x) => usedUrls.has(x.url)) && !opts.topic) {
      generated.push({ title: r.title, added: false, reason: "same source already used", score });
      continue;
    }
    if (addedIds.length >= maxAdd) {
      generated.push({ title: r.title, added: false, reason: "not in the best set", score });
      continue;
    }
    const streams = (r.streams ?? []).filter((x) => STREAM_SLUGS.includes(x));
    const brand = ["ornate", "unityess", "both"].includes(r.brand ?? "") ? r.brand! : "ornate";
    const row = await insertAudited<{ id: number }>(
      ctx,
      "ideas",
      { title: r.title.slice(0, 200), detail: r.detail ?? "", streams: streams.length ? streams : ["linkedin-company"], whyNow: r.why_now ?? "", sources, brand, score, fingerprint: fingerprint(r.title), agentId: agent.id },
      `New idea: ${r.title}`,
    );
    pool.push(r.title);
    sources.forEach((x) => usedUrls.add(x.url));
    addedIds.push(row.id);
    generated.push({ title: r.title, added: true, id: row.id, score });
  }

  const summary = `Read ${headlines.length} headlines${opts.topic ? ` on “${opts.topic}”` : ""}, suggested ${raw.length}, added ${addedIds.length}${offline ? " (AI offline: headline-only ideas)" : ""}`;
  await db.insert(s.agentRuns).values({ agentId: agent.id, managerId: agent.managerId, kind: "research", status: offline ? "skipped" : "ok", summary, startedAt: started, finishedAt: new Date() });
  await db.update(s.agents).set({ lastRunAt: new Date() }).where(eq(s.agents.id, agent.id));
  return { agent: agent.name, headlines: headlines.length, generated, addedIds, offline };
}

/** Pick the researcher best suited to a topic (simple keyword match on job + queries). */
export async function pickResearcher(topic: string) {
  const db = await getDb();
  const researchers = await db
    .select({ id: s.agents.id, name: s.agents.name, config: s.agents.config })
    .from(s.agents)
    .innerJoin(s.managers, eq(s.agents.managerId, s.managers.id))
    .innerJoin(s.streams, eq(s.managers.streamId, s.streams.id))
    .where(and(eq(s.streams.slug, "ideas"), eq(s.agents.status, "active")));
  if (!researchers.length) throw new Error("No active research agents");
  let best = researchers[0], bestScore = -1;
  for (const r of researchers) {
    const text = `${r.name} ${((r.config.queries as string[]) ?? []).join(" ")}`;
    const sc = similarity(text, topic);
    if (sc > bestScore) { best = r; bestScore = sc; }
  }
  return best;
}

/** Cron: keep 30–40 fresh ideas waiting, within each researcher's daily quota. */
export async function researchTick() {
  const db = await getDb();
  const [{ n: waiting }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.ideas).where(eq(s.ideas.status, "waiting"));
  if (waiting >= IDEA_TARGET_MIN) return `Ideas: ${waiting} waiting, nothing to do`;
  const [ideasStream] = await db.select().from(s.streams).where(eq(s.streams.slug, "ideas"));
  const [mgr] = await db.select().from(s.managers).where(eq(s.managers.streamId, ideasStream.id));
  if (mgr.status !== "active") return "Ideas manager is paused";
  const agents = await db.select().from(s.agents).where(and(eq(s.agents.managerId, mgr.id), eq(s.agents.status, "active")));
  const today = istDayStart(istDate());
  let need = IDEA_TARGET_MAX - waiting;
  const lines: string[] = [];
  for (const a of agents) {
    if (need <= 0) break;
    const [{ n: madeToday }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.ideas).where(and(eq(s.ideas.agentId, a.id), gte(s.ideas.createdAt, today)));
    const left = a.dailyQuota - madeToday;
    if (left <= 0) continue;
    const take = Math.min(left, need, 8);
    const r = await runResearchAgent(a.id, { count: take + 2, maxAdd: take });
    need -= r.addedIds.length;
    lines.push(`${a.name}: +${r.addedIds.length}`);
  }
  return `Ideas: ${waiting} were waiting. ${lines.join(", ") || "All researchers at quota."}`;
}
