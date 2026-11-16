import { desc, gte, sql } from "drizzle-orm";
import { actSetLlm, actSetSetting } from "@/app/actions";
import { InlineEdit } from "@/components/ui";
import { getDb, schema as s } from "@/db";
import { getSetting } from "@/lib/ops";
import { fmtDateTime, istDate, istDayStart } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function Settings() {
  const db = await getDb();
  const llm = await db.select().from(s.llmSettings).orderBy(s.llmSettings.id);
  const usage = await db
    .select({ purpose: s.llmCalls.purpose, calls: sql<number>`count(*)::int`, tokens: sql<number>`coalesce(sum(${s.llmCalls.totalTokens}),0)::int`, failed: sql<number>`count(*) filter (where not ${s.llmCalls.ok})::int` })
    .from(s.llmCalls)
    .where(gte(s.llmCalls.createdAt, istDayStart(istDate())))
    .groupBy(s.llmCalls.purpose);
  const recent = await db.select().from(s.llmCalls).orderBy(desc(s.llmCalls.id)).limit(15);
  const hook = await getSetting<string>("instinct_webhook_url", "");
  const mailTo = await getSetting<string>("report_email_to", "");
  const keyStatus = (k: string) => (process.env[k] ? "set" : "missing");

  return (
    <>
      <div className="page-head"><div><h1>Settings</h1><div className="sub">AI models change here without a deploy. Every AI call is logged with its tokens.</div></div></div>
      <div className="grid g2">
        <div className="card">
          <div className="card-head"><h2>AI models (Groq)</h2><span className="small muted">GROQ_API_KEY: {keyStatus("GROQ_API_KEY")}</span></div>
          <table>
            <tbody>
              {llm.map((l) => (
                <tr key={l.id}><td className="strong" style={{ width: 90 }}>{l.purpose}</td><td><InlineEdit value={l.model} onSave={actSetLlm.bind(null, l.purpose)} /></td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <div className="card-head"><h2>Daily summary delivery</h2></div>
          <div className="small strong">Instinct webhook URL</div>
          <InlineEdit wide value={hook} placeholder="https://…" onSave={actSetSetting.bind(null, "instinct_webhook_url")} />
          <div className="small strong" style={{ marginTop: 10 }}>Email to (comma separated)</div>
          <InlineEdit wide value={mailTo} placeholder="name@ornatesolar.com" onSave={actSetSetting.bind(null, "report_email_to")} />
          <div className="tiny muted" style={{ marginTop: 6 }}>Email sends through Resend (RESEND_API_KEY: {keyStatus("RESEND_API_KEY")}). Cron secret: {keyStatus("CRON_SECRET")}.</div>
        </div>
      </div>
      <div className="grid g2 section">
        <div className="card">
          <div className="card-head"><h2>AI usage today</h2></div>
          {usage.length === 0 ? <p className="empty">No AI calls today.</p> : (
            <table><thead><tr><th>Purpose</th><th>Calls</th><th>Tokens</th><th>Failed</th></tr></thead><tbody>
              {usage.map((u) => <tr key={u.purpose}><td>{u.purpose}</td><td>{u.calls}</td><td>{u.tokens.toLocaleString("en-IN")}</td><td>{u.failed}</td></tr>)}
            </tbody></table>
          )}
        </div>
        <div className="card">
          <div className="card-head"><h2>Recent AI calls</h2></div>
          <div className="table-wrap"><table><tbody>
            {recent.map((c) => <tr key={c.id}><td className="tiny">{fmtDateTime(c.createdAt)}</td><td className="small">{c.actor}<div className="tiny muted">{c.model}</div></td><td className="small">{c.totalTokens} tok · {c.durationMs} ms</td><td className="tiny">{c.ok ? "ok" : <span className="pill pill-error" title={c.error ?? ""}>failed</span>}</td></tr>)}
          </tbody></table></div>
        </div>
      </div>
    </>
  );
}
