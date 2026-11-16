import { actQuotaDelta, actSaveJob, actSetStatus } from "@/app/actions";
import { ActButton, JobEditor } from "@/components/ui";
import { fmtDateTime } from "@/lib/time";

export function StatusButtons({ type, id, status, name }: { type: "agent" | "manager"; id: number; status: string; name: string }) {
  return (
    <span className="row gap-s">
      {status !== "active" && <ActButton className="btn btn-ok btn-sm" action={actSetStatus.bind(null, type, id, "active")}>{status === "retired" ? "Bring back" : "Resume"}</ActButton>}
      {status === "active" && <ActButton className="btn btn-ghost btn-sm" action={actSetStatus.bind(null, type, id, "paused")}>Pause</ActButton>}
      {status !== "retired" && (
        <ActButton className="btn btn-ghost btn-sm" action={actSetStatus.bind(null, type, id, "retired")} confirmText={`Retire ${name}? It stops working but is never deleted; you can bring it back.`}>
          Retire
        </ActButton>
      )}
    </span>
  );
}

export function QuotaControl({ type, id, quota }: { type: "agent" | "manager"; id: number; quota: number }) {
  return (
    <span className="quota" aria-label="Daily quota">
      <ActButton className="btn btn-ghost btn-sm" action={actQuotaDelta.bind(null, type, id, -1)} title="One less per day">−</ActButton>
      <b>{quota}</b>
      <ActButton className="btn btn-ghost btn-sm" action={actQuotaDelta.bind(null, type, id, 1)} title="One more per day">+</ActButton>
      <span className="tiny muted">/day</span>
    </span>
  );
}

export function JobSection({ type, id, versions }: { type: "agent" | "manager"; id: number; versions: { version: number; prompt: string; note: string | null; createdBy: string; createdAt: Date }[] }) {
  const current = versions[0];
  return (
    <div className="card">
      <div className="card-head">
        <h2>Skill / job description</h2>
        <span className="small muted">v{current?.version ?? 0} · {current ? `${current.createdBy}, ${fmtDateTime(current.createdAt)}` : ""}</span>
      </div>
      <JobEditor prompt={current?.prompt ?? ""} onSave={actSaveJob.bind(null, type, id)} />
      {versions.length > 1 && (
        <div className="versions" style={{ marginTop: 12 }}>
          <div className="small strong">Earlier versions</div>
          {versions.slice(1).map((v) => (
            <details key={v.version}>
              <summary>v{v.version} · {v.createdBy} · {fmtDateTime(v.createdAt)}{v.note ? ` · ${v.note}` : ""}</summary>
              <pre>{v.prompt}</pre>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
