import Link from "next/link";
import { notFound } from "next/navigation";
import { actApproveItem, actClearFocus, actRunPlans, actSendBack } from "@/app/actions";
import { BrandPill, PipelineBar, Pill, STAGE_COLOR, STAGE_LABEL } from "@/components/bits";
import { ActButton, ChatButton, ReasonButton } from "@/components/ui";
import { streamPage } from "@/lib/queries";
import { fmtDateTime, fmtDay, istDate, istDateOf } from "@/lib/time";

export const dynamic = "force-dynamic";

const PHASE_NOTE: Record<number, string> = {
  2: "Agents start drafting for this stream in phase 2. For now, approved ideas and requests queue here and the manager plans them each morning.",
  3: "Agents start drafting for this stream in phase 3. Approved ideas and requests already queue here.",
  4: "The Video Studio (avatar renders with recorded consent, Indian-language versions, daily budget cap) arrives in phase 4. Scripts and requests already queue here.",
};

export default async function StreamPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ view?: string }> }) {
  const { slug } = await params;
  const { view = "board" } = await searchParams;
  const d = await streamPage(slug);
  if (!d) notFound();
  const counts = Object.fromEntries(d.columns.map((c) => [c.stage, c.items.length]));
  const agentName = new Map(d.agents.map((a) => [a.id, a.name]));
  const upcoming = Array.from({ length: 30 }, (_, i) => istDate(i)).map((date) => ({ date, items: d.items.filter((it) => istDateOf(it.scheduledAt) === date) }));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{d.stream.name}</h1>
          <div className="sub">
            <Link href={`/team/managers/${d.manager.id}`}>{d.manager.name}</Link> · {d.agents.filter((a) => a.status === "active").length} active agents · team quota {d.manager.dailyQuota}/day · <Pill v={d.manager.status} />
          </div>
        </div>
        <div className="row gap-s">
          <ChatButton label="Request content" text={`Make 3 ${d.stream.name} pieces on `} />
          <ChatButton label="Set focus" text={`${d.manager.name}: focus on  until `} />
        </div>
      </div>

      {PHASE_NOTE[d.stream.phase] && <div className="phase-note">{PHASE_NOTE[d.stream.phase]}</div>}

      <div className="grid g2">
        <div className="card">
          <div className="card-head">
            <h2>Today&apos;s plan</h2>
            <ActButton className="btn btn-ghost btn-sm" action={actRunPlans.bind(null, d.manager.id)}>{d.plan ? "Rebuild" : "Make plan now"}</ActButton>
          </div>
          {d.focus && (
            <div className="row gap-s" style={{ marginBottom: 8 }}>
              <span className="pill pill-focus">Focus: {d.focus.kind} “{d.focus.value}” until {d.focus.untilDate}</span>
              <ActButton className="link-btn small" action={actClearFocus.bind(null, d.manager.id)}>clear</ActButton>
            </div>
          )}
          {d.plan ? (
            <>
              <p className="small">{d.plan.summary}</p>
              <ol className="small" style={{ paddingLeft: 18, margin: 0 }}>
                {d.planItems.map((p) => (
                  <li key={p.id} style={{ marginBottom: 4 }}>
                    <b>{p.title}</b> <span className="muted">— {p.agentId ? agentName.get(p.agentId) : ""}{p.why ? `; ${p.why}` : ""}</span> <Pill v={p.status === "done" ? "ok" : "pending"} label={p.status} />
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="empty">No plan yet today. Managers plan at 7 am IST.</p>
          )}
        </div>
        <div className="card">
          <div className="card-head"><h2>Pipeline</h2><span className="small muted">Performance appears here once publishing connectors are live (phase 5)</span></div>
          <PipelineBar counts={counts} legend />
        </div>
      </div>

      <div className="tabs section">
        <Link href={`/streams/${slug}`} className={view === "board" ? "on" : ""}>Board</Link>
        <Link href={`/streams/${slug}?view=calendar`} className={view === "calendar" ? "on" : ""}>Calendar</Link>
      </div>

      {view === "calendar" ? (
        <div className="card">
          <div className="cal">
            {upcoming.map((u, i) => (
              <div key={u.date} className={`cal-day ${i === 0 ? "today" : ""}`}>
                <div className="d">{fmtDay(u.date)}</div>
                {u.items.map((it) => <div key={it.id} className="ev" title={it.title}>#{it.id} {it.title}</div>)}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="board">
          {d.columns.map((c) => (
            <div key={c.stage} className="col">
              <div className="col-head">
                <span><i style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: STAGE_COLOR[c.stage], marginRight: 6 }} />{STAGE_LABEL[c.stage]}</span>
                <span>{c.items.length}</span>
              </div>
              {c.items.slice(0, 40).map((it) => (
                <div key={it.id} className="tile">
                  <div className="t">#{it.id} {it.title}</div>
                  <div className="row gap-s">
                    <BrandPill brand={it.brand} />
                    {it.language !== "en" && <span className="pill">{it.language}</span>}
                    {it.hasNumbers && <span className="pill pill-num">numbers</span>}
                    {it.parentId && <span className="pill">version of #{it.parentId}</span>}
                  </div>
                  <div className="tiny muted" style={{ marginTop: 4 }}>
                    {it.scheduledAt ? `Scheduled ${fmtDateTime(it.scheduledAt)}` : it.dueDate ? `Due ${it.dueDate}` : `Added ${fmtDateTime(it.createdAt)}`}
                    {it.agentId ? ` · ${agentName.get(it.agentId)}` : ""}
                  </div>
                  {it.stage === "waiting_for_me" && (
                    <div className="row gap-s" style={{ marginTop: 6 }}>
                      <ActButton className="btn btn-ok btn-sm" action={actApproveItem.bind(null, it.id)}>Approve</ActButton>
                      <ReasonButton className="btn btn-ghost btn-sm" label="Send back" action={actSendBack.bind(null, it.id)} chips={["Shorter", "Warmer tone", "Check the numbers", "Off-brand"]} placeholder="Feedback…" />
                    </div>
                  )}
                  {(it.brief || it.body) && (
                    <details>
                      <summary>Details</summary>
                      {it.brief && <p className="small" style={{ whiteSpace: "pre-wrap" }}>{it.brief}</p>}
                      {it.body && <p className="small" style={{ whiteSpace: "pre-wrap" }}>{it.body}</p>}
                    </details>
                  )}
                  <Link href={`/audit?entity=content_items&id=${it.id}`} className="tiny">History</Link>
                </div>
              ))}
              {c.items.length === 0 && <div className="tiny muted" style={{ padding: 4 }}>—</div>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
