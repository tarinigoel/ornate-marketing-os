import { getDb, schema as s } from "@/db";

export const dynamic = "force-dynamic";

export default async function Publishing() {
  const db = await getDb();
  const channels = await db.select().from(s.channels).orderBy(s.channels.id);
  return (
    <>
      <div className="page-head"><div><h1>Publishing &amp; metrics</h1><div className="sub">One interface for every channel. Nothing is posted without an approval on record.</div></div></div>
      <div className="phase-note">Phase 5. Today every channel works as “export + mark published” (ask the chat: “mark #12 published on LinkedIn”). API posting and performance pulls (impressions, engagement, clicks, leads) get added channel by channel.</div>
      <div className="card">
        <table>
          <thead><tr><th>Channel</th><th>Mode</th><th>Status</th></tr></thead>
          <tbody>{channels.map((c) => <tr key={c.id}><td className="strong">{c.name}</td><td>{c.mode === "export" ? "Export + mark published" : "API"}</td><td>{c.enabled ? "On" : "Off"}</td></tr>)}</tbody>
        </table>
      </div>
    </>
  );
}
