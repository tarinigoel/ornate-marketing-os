import Link from "next/link";
import { actApproveItem, actDecideIdea, actFindIdeas, actRunPlans, actSendBack, actWriteReports } from "@/app/actions";
import { BrandPill, PipelineBar, Pill, ReportBlock } from "@/components/bits";
import { ActButton, ReasonButton } from "@/components/ui";
import { overview } from "@/lib/queries";
import { fmtDateTime, fmtDay } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function Overview() {
  const o = await overview();
  const needsMe = o.waitingItems.length + o.waitingIdeas;
  const maxDay = Math.max(1, ...o.week.flatMap((d) => [d.ideas, d.items, d.approved, d.published]));
  const plannedTotal = o.managers.reduce((n, m) => n + m.planned, 0);
  const doneTotal = o.managers.reduce((n, m) => n + m.done, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Your actions today</h1>
          <div className="sub">{fmtDay(o.today)} · {needsMe ? `${needsMe} thing${needsMe === 1 ? "" : "s"} waiting for you` : "Nothing waiting for you"}</div>
        </div>
        <div className="row gap-s">
          <ActButton className="btn btn-ghost btn-sm" action={actRunPlans.bind(null, undefined)}>Rebuild today&apos;s plans</ActButton>
          <ActButton className="btn btn-ghost btn-sm" action={actWriteReports}>Write end-of-day reports</ActButton>
        </div>
      </div>

      <div className="actions-today">
        <div className={`card action-card ${needsMe ? "hot" : ""}`}>
          <div className="card-head"><h2>Waiting for me</h2><span className="big">{needsMe}</span></div>
          {o.waitingItems.length === 0 && o.waitingIdeas === 0 && <p className="empty">You&apos;re clear.</p>}
          <ul className="list">
            {o.waitingItems.slice(0, 4).map((i) => (
              <li key={i.id}>
                <div className="li-main">
                  <div className="strong clip">#{i.id} {i.title}</div>
                  <div className="tiny muted">{i.stream}{i.hasNumbers ? " · has numbers: check them" : ""}</div>
                </div>
                <span className="row gap-s">
                  <ActButton className="btn btn-ok btn-sm" action={actApproveItem.bind(null, i.id)}>Approve</ActButton>
                  <ReasonButton className="btn btn-ghost btn-sm" label="Send back" action={actSendBack.bind(null, i.id)} chips={["Shorter", "Warmer tone", "Check the numbers", "Off-brand"]} placeholder="Feedback…" />
                </span>
              </li>
            ))}
            {o.waitingIdeas > 0 && (
              <li>
                <div className="li-main">
                  <Link href="/ideas" className="strong">{o.waitingIdeas} ideas to review</Link>
                  <div className="tiny muted clip">Top: {o.topIdeas[0]?.title}</div>
                </div>
                {o.topIdeas[0] && (
                  <span className="row gap-s">
                    <ActButton className="btn btn-ok btn-sm" action={actDecideIdea.bind(null, o.topIdeas[0].id, "approve", undefined)} title="Approve the top idea">Approve top</ActButton>
                  </span>
                )}
              </li>
            )}
          </ul>
        </div>

        <div className="card action-card">
          <div className="card-head"><h2>Due to publish today</h2><span className="big">{o.dueToday.length}</span></div>
          {o.dueToday.length === 0 ? <p className="empty">Nothing scheduled today.</p> : (
            <ul className="list">
              {o.dueToday.slice(0, 5).map((i) => (
                <li key={i.id}>
                  <div className="li-main"><div className="strong clip">#{i.id} {i.title}</div><div className="tiny muted">{i.stream} · {fmtDateTime(i.scheduledAt)}</div></div>
                  <Pill v={i.stage === "scheduled" ? "approved" : "waiting"} label={i.stage === "scheduled" ? "ready" : "not approved"} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card action-card">
          <div className="card-head"><h2>Stuck</h2><span className="big">{o.stuckItems.length + o.failedRuns.length}</span></div>
          {o.stuckItems.length + o.failedRuns.length === 0 ? <p className="empty">Nothing stuck.</p> : (
            <ul className="list">
              {o.stuckItems.map((i) => (
                <li key={`i${i.id}`}><div className="li-main"><div className="strong clip">#{i.id} {i.title}</div><div className="tiny muted">{i.stream} · {i.stage.replace("_", " ")} since {fmtDateTime(i.stageChangedAt)}</div></div></li>
              ))}
              {o.failedRuns.map((r) => (
                <li key={`r${r.id}`}><div className="li-main"><div className="strong clip">{r.agentId ? o.agentNames.get(r.agentId) : "Manager"} {r.kind} failed</div><div className="tiny muted clip">{r.summary}</div></div></li>
              ))}
            </ul>
          )}
        </div>

        <div className="card action-card">
          <div className="card-head"><h2>Today so far</h2></div>
          <div className="stat-row">
            <div className="stat"><b>{o.soFar.madeItems + o.soFar.madeIdeas}</b><span>made</span></div>
            <div className="stat"><b>{o.soFar.approvedToday}</b><span>approved</span></div>
            <div className="stat"><b>{o.soFar.publishedToday}</b><span>published</span></div>
            <div className="stat"><b>{o.soFar.inProgress}</b><span>in progress</span></div>
          </div>
          <div className="tiny muted">{o.soFar.madeIdeas} ideas, {o.soFar.madeItems} content items · plans {doneTotal}/{plannedTotal} done</div>
          {o.soFar.feedback[0] && <div className="small" style={{ marginTop: 8 }}><b>Latest feedback:</b> “{o.soFar.feedback[0].comment}” <span className="muted tiny">({o.soFar.feedback[0].subjectType} #{o.soFar.feedback[0].subjectId})</span></div>}
        </div>
      </div>

      <div className="section">
        <div className="card-head"><h2>Managers</h2><span className="small muted">Today&apos;s plan progress and pipeline</span></div>
        <div className="cards">
          {o.managers.map((m) => (
            <div key={m.manager.id} className="card mgr-card">
              <div className="row between">
                <h3><Link href={m.stream.slug === "ideas" ? "/ideas" : `/streams/${m.stream.slug}`}>{m.stream.name}</Link></h3>
                <Pill v={m.manager.status} />
              </div>
              <div className="small muted">
                <Link href={`/team/managers/${m.manager.id}`}>{m.manager.name}</Link> · {m.activeAgents}/{m.totalAgents} agents active
              </div>
              <div className="meta">
                {m.focus && <span className="pill pill-focus">Focus: {m.focus.value} → {m.focus.untilDate.slice(5)}</span>}
                {m.stream.phase > 1 && <span className="pill">Drafting from phase {m.stream.phase}</span>}
              </div>
              <div className="row between tiny muted"><span>Plan: {m.plan ? `${m.done}/${m.planned} done` : "not made yet"}</span><span>{m.runsToday} runs today</span></div>
              <div className="progress"><span style={{ width: `${m.planned ? (100 * m.done) / m.planned : 0}%` }} /></div>
              <PipelineBar counts={m.pipeline} />
              {m.plan?.summary && <p className="small" style={{ marginTop: 6 }}>{m.plan.summary}</p>}
            </div>
          ))}
        </div>
      </div>

      <div className="grid g2 section">
        <div className="card">
          <div className="card-head"><h2>Last 7 days</h2>
            <div className="legend"><span><i style={{ background: "#93b4f5" }} />Ideas</span><span><i style={{ background: "#6b8fe8" }} />Items</span><span><i style={{ background: "#e8890c" }} />Approved</span><span><i style={{ background: "#15803d" }} />Published</span></div>
          </div>
          <div className="chart">
            {o.week.map((d) => (
              <div key={d.date} className="day">
                <div className="bars">
                  {([["ideas", "#93b4f5"], ["items", "#6b8fe8"], ["approved", "#e8890c"], ["published", "#15803d"]] as const).map(([k, c]) => (
                    <span key={k} style={{ height: `${(100 * d[k]) / maxDay}%`, background: c }} title={`${k}: ${d[k]}`} />
                  ))}
                </div>
                <div className="lbl">{fmtDay(d.date).split(",")[0]}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h2>Head summary</h2><span className="small muted">{o.headReport ? fmtDay(o.headReport.date) : ""}</span></div>
          {o.headReport ? <ReportBlock r={o.headReport} /> : <p className="empty">The all-company summary is written at 7 pm. <ActButton className="link-btn" action={actWriteReports}>Write it now</ActButton></p>}
          {o.headReport && <div className="tiny muted">Sent to: {o.headReport.deliveredTo.length ? o.headReport.deliveredTo.join(", ") : "not delivered (set the Instinct webhook in Settings)"}</div>}
        </div>
      </div>

      <div className="card section">
        <div className="card-head"><h2>Next 14 days</h2><span className="small muted">Scheduled content</span></div>
        <div className="cal">
          {o.calendar.map((d, i) => (
            <div key={d.date} className={`cal-day ${i === 0 ? "today" : ""}`}>
              <div className="d">{fmtDay(d.date)}</div>
              {d.items.slice(0, 3).map((it) => <div key={it.id} className="ev" title={`${it.stream}: ${it.title}`}>{it.title}</div>)}
              {d.items.length > 3 && <div className="tiny muted">+{d.items.length - 3} more</div>}
            </div>
          ))}
        </div>
      </div>

      <div className="section row gap-s">
        <ActButton className="btn btn-ghost btn-sm" action={actFindIdeas}>Top up ideas now</ActButton>
        <span className="tiny muted">Agents wake every 30 minutes: plans at 7 am, research through the day, reports at 7 pm (IST).</span>
      </div>
    </>
  );
}
