import { desc } from "drizzle-orm";
import { actAddFact, actFactStatus } from "@/app/actions";
import { BrandPill, Pill } from "@/components/bits";
import { ActButton, FactForm } from "@/components/ui";
import { getDb, schema as s } from "@/db";
import { fmtDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function Facts() {
  const db = await getDb();
  const facts = await db.select().from(s.brandFacts).orderBy(desc(s.brandFacts.id));
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Brand facts</h1>
          <div className="sub">The only facts agents may use: credentials, numbers, product specs and customers cleared for publication. Anything else is written as [NUMBER NEEDED] and flagged for you.</div>
        </div>
      </div>
      <div className="card">
        <div className="card-head"><h2>Add a fact</h2><span className="small muted">or tell the chat: “Add fact: …”</span></div>
        <FactForm onAdd={actAddFact} />
      </div>
      <div className="card section">
        <div className="table-wrap">
          <table>
            <thead><tr><th>#</th><th>Fact</th><th>Brand</th><th>Type</th><th>Status</th><th>Source</th><th></th></tr></thead>
            <tbody>
              {facts.map((f) => (
                <tr key={f.id}>
                  <td className="mono muted">{f.id}</td>
                  <td>{f.statement}<div className="tiny muted">{f.approvedBy ? `Approved by ${f.approvedBy}` : "Not approved"} · {fmtDateTime(f.createdAt)}</div></td>
                  <td><BrandPill brand={f.brand} /></td>
                  <td className="small">{f.category}</td>
                  <td><Pill v={f.status} /></td>
                  <td className="small">{f.source}</td>
                  <td style={{ textAlign: "right" }}>
                    {f.status !== "approved" && <ActButton className="btn btn-ok btn-sm" action={actFactStatus.bind(null, f.id, "approved")}>Approve</ActButton>}
                    {f.status !== "retired" && <ActButton className="btn btn-ghost btn-sm" action={actFactStatus.bind(null, f.id, "retired")}>Retire</ActButton>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
