import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Pill } from "@/components/bits";
import { QuotaControl, StatusButtons } from "@/components/controls";
import { ChatButton } from "@/components/ui";
import { getDb, schema as s } from "@/db";
import { activeFocus } from "@/lib/ops";
import { streamsWithManagers } from "@/lib/queries";
import { fmtDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function Team() {
  const db = await getDb();
  const sm = await streamsWithManagers();
  const agents = await db.select().from(s.agents).orderBy(s.agents.id);
  const runs = await db.select().from(s.agentRuns).orderBy(desc(s.agentRuns.id)).limit(500);
  const lastRun = (agentId: number) => runs.find((r) => r.agentId === agentId);
  const focuses = await Promise.all(sm.map(({ manager }) => activeFocus(manager.id)));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Managers &amp; agents</h1>
          <div className="sub">Head (Fateh) → {sm.length} AI managers → {agents.filter((a) => a.status !== "retired").length} AI agents. Agents draft; managers review and rank; you approve.</div>
        </div>
        <ChatButton label="Change the team by chat" text="" />
      </div>
      <div className="grid" style={{ gap: 14 }}>
        {sm.map(({ stream, manager }, idx) => (
          <div key={manager.id} className="card">
            <div className="card-head" style={{ flexWrap: "wrap" }}>
              <div>
                <h2 style={{ marginBottom: 2 }}>
                  <Link href={`/team/managers/${manager.id}`}>{manager.name}</Link> <Pill v={manager.status} />
                </h2>
                <div className="small muted">
                  {stream.name}
                  {focuses[idx] && <> · <span className="pill pill-focus">Focus: {focuses[idx]!.value} → {focuses[idx]!.untilDate}</span></>}
                </div>
              </div>
              <span className="row gap">
                <span className="small muted">Team</span>
                <QuotaControl type="manager" id={manager.id} quota={manager.dailyQuota} />
                <StatusButtons type="manager" id={manager.id} status={manager.status} name={manager.name} />
              </span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Agent</th><th>Status</th><th>Daily quota</th><th>Last run</th><th></th></tr>
                </thead>
                <tbody>
                  {agents.filter((a) => a.managerId === manager.id).map((a) => {
                    const r = lastRun(a.id);
                    return (
                      <tr key={a.id}>
                        <td><Link href={`/team/agents/${a.id}`} className="strong">{a.name}</Link><div className="tiny muted">{a.kind}</div></td>
                        <td><Pill v={a.status} /></td>
                        <td><QuotaControl type="agent" id={a.id} quota={a.dailyQuota} /></td>
                        <td className="small">{r ? <>{r.summary}<div className="tiny muted">{fmtDateTime(r.startedAt)}</div></> : <span className="muted">Not run yet</span>}</td>
                        <td style={{ textAlign: "right" }}><StatusButtons type="agent" id={a.id} status={a.status} name={a.name} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
