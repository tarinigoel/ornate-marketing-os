import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { actDecideIdea, actFindIdeas } from "@/app/actions";
import { BrandPill, Pill } from "@/components/bits";
import { ActButton, ChatButton, ReasonButton } from "@/components/ui";
import { getDb, schema as s } from "@/db";
import { IDEA_TARGET_MAX, IDEA_TARGET_MIN } from "@/lib/research";
import { fmtDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";

const TABS = [
  ["waiting", "Waiting"],
  ["approved", "Approved"],
  ["rejected", "Rejected"],
] as const;

export default async function Ideas({ searchParams }: { searchParams: Promise<{ tab?: string; brand?: string }> }) {
  const { tab = "waiting", brand } = await searchParams;
  const db = await getDb();
  const counts = await db.select({ status: s.ideas.status, n: sql<number>`count(*)::int` }).from(s.ideas).groupBy(s.ideas.status);
  const count = (k: string) => counts.find((c) => c.status === k)?.n ?? 0;
  const ideas = await db
    .select()
    .from(s.ideas)
    .where(and(eq(s.ideas.status, tab), brand ? eq(s.ideas.brand, brand) : undefined))
    .orderBy(tab === "waiting" ? desc(s.ideas.score) : desc(s.ideas.decidedAt), desc(s.ideas.id))
    .limit(100);
  const agents = new Map((await db.select({ id: s.agents.id, name: s.agents.name }).from(s.agents)).map((a) => [a.id, a.name]));
  const streams = new Map((await db.select().from(s.streams)).map((x) => [x.slug, x.name]));
  const waiting = count("waiting");

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Ideas</h1>
          <div className="sub">
            Research agents keep {IDEA_TARGET_MIN}–{IDEA_TARGET_MAX} fresh ideas waiting. Approve sends an idea to its stream&apos;s manager; a reject reason teaches the researchers.
          </div>
        </div>
        <div className="row gap-s">
          <ChatButton label="Ask for ideas on…" text="Give me 10 new ideas on " />
          <ActButton className="btn btn-accent btn-sm" action={actFindIdeas}>Top up now</ActButton>
        </div>
      </div>

      <div className="tabs">
        {TABS.map(([k, l]) => (
          <Link key={k} href={`/ideas?tab=${k}`} className={tab === k ? "on" : ""}>
            {l} <span className="muted">{count(k)}</span>
          </Link>
        ))}
        <span className="grow" />
        {[undefined, "ornate", "unityess"].map((b) => (
          <Link key={b ?? "all"} href={`/ideas?tab=${tab}${b ? `&brand=${b}` : ""}`} className={brand === b ? "on" : ""}>
            {b === "ornate" ? "Ornate Solar" : b === "unityess" ? "UnityESS" : "All brands"}
          </Link>
        ))}
      </div>

      {tab === "waiting" && waiting < IDEA_TARGET_MIN && (
        <div className="phase-note">
          {waiting} waiting, below the {IDEA_TARGET_MIN} target. Researchers top up every 30 minutes, or press <b>Top up now</b>.
        </div>
      )}

      {ideas.length === 0 ? (
        <div className="card empty">No {tab} ideas{brand ? " for this brand" : ""}.</div>
      ) : (
        <div className="card">
          <ul className="list">
            {ideas.map((i) => (
              <li key={i.id} className="idea">
                <div className="li-main">
                  <div className="row gap-s" style={{ marginBottom: 2 }}>
                    <span className="tiny muted mono">#{i.id}</span>
                    <BrandPill brand={i.brand} />
                    {i.streams.map((x) => <span key={x} className="pill">{streams.get(x) ?? x}</span>)}
                    <span className="tiny muted" title="Expected impact (agent's estimate)">score {i.score}</span>
                  </div>
                  <div className="title">{i.title}</div>
                  {i.detail && <div className="why">{i.detail}</div>}
                  {i.whyNow && <div className="why"><b>Why now:</b> {i.whyNow}</div>}
                  {i.sources.length > 0 && (
                    <div className="srcs">
                      {i.sources.map((src) => (
                        <a key={src.url} href={src.url} target="_blank" rel="noreferrer noopener">↗ {src.title}</a>
                      ))}
                    </div>
                  )}
                  <div className="tiny muted" style={{ marginTop: 4 }}>
                    {i.agentId ? agents.get(i.agentId) : "Added by hand"} · {fmtDateTime(i.createdAt)}
                    {i.status !== "waiting" && <> · {i.status} by {i.decidedBy} {fmtDateTime(i.decidedAt)}</>}
                    {i.rejectReason && <> · reason: “{i.rejectReason}”</>}
                  </div>
                </div>
                <div className="btns">
                  {i.status === "waiting" ? (
                    <>
                      <ActButton className="btn btn-ok btn-sm" action={actDecideIdea.bind(null, i.id, "approve", undefined)}>Approve</ActButton>
                      <ReasonButton
                        className="btn btn-ghost btn-sm"
                        label="Reject"
                        action={actDecideIdea.bind(null, i.id, "reject")}
                        chips={["Old news", "Not our audience", "Off-brand", "Too generic", "Duplicate", "Risky claim"]}
                        placeholder="Or type a reason…"
                      />
                      <ChatButton label="Edit" text={`Edit idea #${i.id}: `} />
                    </>
                  ) : (
                    <Pill v={i.status} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
