import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { actClearFocus, actRunPlans } from "@/app/actions";
import { Pill, ReportBlock } from "@/components/bits";
import { JobSection, QuotaControl, StatusButtons } from "@/components/controls";
import { ActButton, ChatButton } from "@/components/ui";
import { getDb, schema as s } from "@/db";
import { activeFocus } from "@/lib/ops";
import { fmtDateTime, fmtDay, istDate } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function ManagerPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const db = await getDb();
  const [m] = await db.select().from(s.managers).where(eq(s.managers.id, id));
  if (!m) notFound();
  const [stream] = await db.select().from(s.streams).where(eq(s.streams.id, m.streamId));
  const agents = await db.select().from(s.agents).where(eq(s.agents.managerId, id));
  const versions = await db.select().from(s.jobDescriptions).where(and(eq(s.jobDescriptions.ownerType, "manager"), eq(s.jobDescriptions.ownerId, id))).orderBy(desc(s.jobDescriptions.version));
  const focus = await activeFocus(id);
  const [plan] = await db.select().from(s.workPlans).where(and(eq(s.workPlans.managerId, id), eq(s.workPlans.date, istDate())));
  const planItems = plan ? await db.select().from(s.planItems).where(eq(s.planItems.planId, plan.id)).orderBy(asc(s.planItems.position)) : [];
  const runs = await db.select().from(s.agentRuns).where(eq(s.agentRuns.managerId, id)).orderBy(desc(s.agentRuns.id)).limit(25);
  const reports = await db.select().from(s.dailyReports).where(eq(s.dailyReports.managerId, id)).orderBy(desc(s.dailyReports.date)).limit(7);
  const agentName = new Map(agents.map((a) => [a.id, a.name]));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="small"><Link href="/team">Managers &amp; agents</Link> /</div>
          <h1>{m.name} <Pill v={m.status} /></h1>
          <div className="sub">Manages <Link href={stream.slug === "ideas" ? "/ideas" : `/streams/${stream.slug}`}>{stream.name}</Link> · reports to Fateh</div>
        </div>
        <span className="row gap">
          <QuotaControl type="manager" id={id} quota={m.dailyQuota} />
          <StatusButtons type="manager" id={id} status={m.status} name={m.name} />
        </span>
      </div>

      <div className="grid g2">
        <div className="card">
          <div className="card-head"><h2>Focus</h2><ChatButton label={focus ? "Change" : "Set focus"} text={`${m.name}: focus on  until `} /></div>
          {focus ? (
            <div className="row gap-s"><span className="pill pill-focus">{focus.kind}: “{focus.value}” until {focus.untilDate}</span><ActButton className="link-btn small" action={actClearFocus.bind(null, id)}>clear</ActButton></div>
          ) : <p className="empty">No focus. The manager plans from the backlog and ideas.</p>}
        </div>
        <div className="card">
          <div className="card-head"><h2>Today&apos;s plan</h2><ActButton className="btn btn-ghost btn-sm" action={actRunPlans.bind(null, id)}>{plan ? "Rebuild" : "Make plan now"}</ActButton></div>
          {plan ? (
            <>
              <p className="small">{plan.summary}</p>
              <ol className="small" style={{ paddingLeft: 18, margin: 0 }}>
                {planItems.map((p) => <li key={p.id}><b>{p.title}</b> <span className="muted">— {p.agentId ? agentName.get(p.agentId) : ""}{p.why ? `; ${p.why}` : ""}</span></li>)}
              </ol>
            </>
          ) : <p className="empty">Not made yet today.</p>}
        </div>
      </div>

      <div className="section"><JobSection type="manager" id={id} versions={versions} /></div>

      <div className="grid g2 section">
        <div className="card">
          <div className="card-head"><h2>Agents</h2></div>
          <ul className="list">
            {agents.map((a) => (
              <li key={a.id}>
                <div className="li-main"><Link href={`/team/agents/${a.id}`} className="strong">{a.name}</Link> <Pill v={a.status} /><div className="tiny muted">{a.dailyQuota}/day · last run {a.lastRunAt ? fmtDateTime(a.lastRunAt) : "never"}</div></div>
                <StatusButtons type="agent" id={a.id} status={a.status} name={a.name} />
              </li>
            ))}
          </ul>
        </div>
        <div className="card">
          <div className="card-head"><h2>End-of-day reports</h2></div>
          {reports.length === 0 ? <p className="empty">No reports yet (written at 7 pm IST).</p> : reports.map((r) => (
            <div key={r.id} style={{ marginBottom: 12 }}>
              <div className="small strong">{fmtDay(r.date)}</div>
              <ReportBlock r={r} />
              {r.agentLines.length > 0 && <ul className="tiny muted" style={{ margin: "2px 0 0", paddingLeft: 16 }}>{r.agentLines.map((l) => <li key={l.agent}>{l.agent}: {l.line}</li>)}</ul>}
            </div>
          ))}
        </div>
      </div>

      <div className="card section">
        <div className="card-head"><h2>Run history</h2></div>
        {runs.length === 0 ? <p className="empty">No runs yet.</p> : (
          <ul className="list">{runs.map((r) => <li key={r.id}><div className="li-main small">{r.agentId ? <b>{agentName.get(r.agentId)}: </b> : <b>Manager {r.kind}: </b>}{r.summary}</div><span className="row gap-s"><Pill v={r.status} /><span className="tiny muted">{fmtDateTime(r.startedAt)}</span></span></li>)}</ul>
        )}
      </div>
    </>
  );
}
