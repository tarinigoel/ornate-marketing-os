import { STAGES } from "@/db/schema";

export const STAGE_LABEL: Record<string, string> = {
  idea: "Idea",
  approved_idea: "Approved idea",
  drafting: "Drafting",
  in_review: "In review",
  waiting_for_me: "Waiting for me",
  scheduled: "Scheduled",
  published: "Published",
  measured: "Measured",
};

export const STAGE_COLOR: Record<string, string> = {
  idea: "#cbd2de",
  approved_idea: "#93b4f5",
  drafting: "#6b8fe8",
  in_review: "#a78bfa",
  waiting_for_me: "#e8890c",
  scheduled: "#22a06b",
  published: "#15803d",
  measured: "#0f5132",
};

export function Pill({ v, label }: { v: string; label?: string }) {
  return <span className={`pill pill-${v}`}>{label ?? v.replace(/_/g, " ")}</span>;
}

export function BrandPill({ brand }: { brand: string }) {
  return <Pill v={brand} label={brand === "ornate" ? "Ornate Solar" : brand === "unityess" ? "UnityESS" : "Both"} />;
}

export function PipelineBar({ counts, legend = false }: { counts: Record<string, number>; legend?: boolean }) {
  const total = STAGES.reduce((n, s) => n + (counts[s] ?? 0), 0);
  return (
    <div>
      <div className="pipe-bar" role="img" aria-label={`Pipeline: ${STAGES.map((s) => `${STAGE_LABEL[s]} ${counts[s] ?? 0}`).join(", ")}`}>
        {total > 0 && STAGES.map((s) => (counts[s] ? <span key={s} style={{ width: `${(100 * counts[s]) / total}%`, background: STAGE_COLOR[s] }} title={`${STAGE_LABEL[s]}: ${counts[s]}`} /> : null))}
      </div>
      {legend ? (
        <div className="legend">
          {STAGES.map((s) => (
            <span key={s}>
              <i style={{ background: STAGE_COLOR[s] }} />
              {STAGE_LABEL[s]} {counts[s] ?? 0}
            </span>
          ))}
        </div>
      ) : (
        <div className="tiny muted">{total ? `${total} item${total === 1 ? "" : "s"} in pipeline` : "Pipeline empty"}</div>
      )}
    </div>
  );
}

export function ReportBlock({ r }: { r: { done: string; results: string; stuck: string; tomorrow: string } }) {
  return (
    <div className="report small">
      {r.done && <p><b>Done:</b> {r.done}</p>}
      {r.results && <p><b>Results:</b> {r.results}</p>}
      {r.stuck && <p><b>Stuck:</b> {r.stuck}</p>}
      {r.tomorrow && <p><b>Tomorrow:</b> {r.tomorrow}</p>}
    </div>
  );
}
