import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import { fmtDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";

const ACTORS = ["human", "chat", "agent", "manager", "system"];

function diff(before: unknown, after: unknown) {
  if (!before || !after || typeof before !== "object" || typeof after !== "object") return null;
  const b = before as Record<string, unknown>, a = after as Record<string, unknown>;
  const keys = Object.keys(a).filter((k) => !/At$/.test(k) && JSON.stringify(a[k]) !== JSON.stringify(b[k]));
  if (!keys.length) return null;
  return keys.map((k) => `${k}: ${JSON.stringify(b[k])?.slice(0, 80)} → ${JSON.stringify(a[k])?.slice(0, 80)}`);
}

export default async function Audit({ searchParams }: { searchParams: Promise<{ actor?: string; entity?: string; id?: string }> }) {
  const { actor, entity, id } = await searchParams;
  const db = await getDb();
  const rows = await db
    .select()
    .from(s.auditLog)
    .where(and(actor ? eq(s.auditLog.actorType, actor) : undefined, entity ? eq(s.auditLog.entity, entity) : undefined, id ? eq(s.auditLog.entityId, id) : undefined))
    .orderBy(desc(s.auditLog.id))
    .limit(300);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Audit log</h1>
          <div className="sub">Every change by a person, an agent or the chat: who, what, before and after.{entity && id ? ` Showing ${entity} #${id}.` : ""}</div>
        </div>
      </div>
      <div className="tabs">
        <Link href="/audit" className={!actor ? "on" : ""}>All</Link>
        {ACTORS.map((a) => <Link key={a} href={`/audit?actor=${a}`} className={actor === a ? "on" : ""}>{a}</Link>)}
      </div>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>When</th><th>Who</th><th>What</th><th>Change</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const d = diff(r.before, r.after);
                return (
                  <tr key={r.id}>
                    <td className="small" style={{ whiteSpace: "nowrap" }}>{fmtDateTime(r.at)}</td>
                    <td className="small"><b>{r.actorName}</b><div className="tiny muted">{r.actorType}{r.commandId ? ` · cmd ${r.commandId}` : ""}</div></td>
                    <td className="small">{r.summary}<div className="tiny muted">{r.action} · {r.entity}{r.entityId ? ` #${r.entityId}` : ""}</div></td>
                    <td className="tiny mono" style={{ maxWidth: 380 }}>{d ? d.map((x) => <div key={x} className="clip">{x}</div>) : r.action === "insert" ? "created" : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && <p className="empty">Nothing yet.</p>}
        </div>
      </div>
    </>
  );
}
