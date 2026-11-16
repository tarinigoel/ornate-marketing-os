import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { Pill } from "@/components/bits";
import { JobSection, QuotaControl, StatusButtons } from "@/components/controls";
import { getDb, schema as s } from "@/db";
import { fmtDateTime, fmtDay } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const db = await getDb();
  const [a] = await db.select().from(s.agents).where(eq(s.agents.id, id));
  if (!a) notFound();
  const [m] = await db.select().from(s.managers).where(eq(s.managers.id, a.managerId));
  const versions = await db.select().from(s.jobDescriptions).where(and(eq(s.jobDescriptions.ownerType, "agent"), eq(s.jobDescriptions.ownerId, id))).orderBy(desc(s.jobDescriptions.version));
  const runs = await db.select().from(s.agentRuns).where(eq(s.agentRuns.agentId, id)).orderBy(desc(s.agentRuns.id)).limit(30);
  const reports = await db.select().from(s.dailyReports).where(eq(s.dailyReports.managerId, a.managerId)).orderBy(desc(s.dailyReports.date)).limit(7);
  const lines = reports.map((r) => ({ date: r.date, line: r.agentLines.find((l) => l.agent === a.name)?.line })).filter((l) => l.line);
  const queries = (a.config.queries as string[] | undefined) ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="small"><Link href="/team">Managers &amp; agents</Link> / <Link href={`/team/managers/${m.id}`}>{m.name}</Link> /</div>
          <h1>{a.name} <Pill v={a.status} /></h1>
          <div className="sub">{a.kind} · reports to {m.name} · last run {a.lastRunAt ? fmtDateTime(a.lastRunAt) : "never"}</div>
        </div>
        <span className="row gap">
          <QuotaControl type="agent" id={id} quota={a.dailyQuota} />
          <StatusButtons type="agent" id={id} status={a.status} name={a.name} />
        </span>
      </div>
      <JobSection type="agent" id={id} versions={versions} />
      {queries.length > 0 && (
        <div className="card section"><div className="card-head"><h2>Searches it runs</h2></div><div className="chips">{queries.map((q) => <span key={q} className="pill">{q}</span>)}</div></div>
      )}
      <div className="grid g2 section">
        <div className="card">
          <div className="card-head"><h2>Run history</h2></div>
          {runs.length === 0 ? <p className="empty">No runs yet.</p> : <ul className="list">{runs.map((r) => <li key={r.id}><div className="li-main small">{r.summary}</div><span className="row gap-s"><Pill v={r.status} /><span className="tiny muted">{fmtDateTime(r.startedAt)}</span></span></li>)}</ul>}
        </div>
        <div className="card">
          <div className="card-head"><h2>Daily report lines to {m.name}</h2></div>
          {lines.length === 0 ? <p className="empty">None yet.</p> : <ul className="list">{lines.map((l) => <li key={l.date}><div className="li-main small"><b>{fmtDay(l.date)}:</b> {l.line}</div></li>)}</ul>}
        </div>
      </div>
    </>
  );
}
