"use client";

import { useEffect, useState, useTransition } from "react";
import type { ActResult } from "@/app/actions";

export function toast(message: string, ok = true) {
  window.dispatchEvent(new CustomEvent("omos-toast", { detail: { message, ok } }));
}

export function Toaster() {
  const [items, setItems] = useState<{ id: number; message: string; ok: boolean }[]>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail as { message: string; ok: boolean };
      const id = Date.now() + Math.random();
      setItems((x) => [...x, { id, ...d }]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4500);
    };
    window.addEventListener("omos-toast", on);
    return () => window.removeEventListener("omos-toast", on);
  }, []);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.ok ? "" : "toast-err"}`}>{t.message}</div>
      ))}
    </div>
  );
}

/** One-tap button bound to a server action. */
export function ActButton({
  action,
  children,
  className = "btn",
  title,
  confirmText,
}: {
  action: () => Promise<ActResult>;
  children: React.ReactNode;
  className?: string;
  title?: string;
  confirmText?: string;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className={className}
      title={title}
      disabled={pending}
      aria-busy={pending}
      onClick={() => {
        if (confirmText && !window.confirm(confirmText)) return;
        start(async () => {
          const r = await action();
          toast(r.message, r.ok);
        });
      }}
    >
      {pending ? <span className="spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

/** Button that asks for a short reason (chips or typed) before running. */
export function ReasonButton({
  action,
  label,
  chips,
  placeholder,
  className = "btn btn-ghost",
}: {
  action: (reason: string) => Promise<ActResult>;
  label: string;
  chips: string[];
  placeholder: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const go = (reason: string) =>
    start(async () => {
      const r = await action(reason);
      toast(r.message, r.ok);
      setOpen(false);
      setText("");
    });
  return (
    <span className="reason-wrap">
      <button type="button" className={className} onClick={() => setOpen((o) => !o)} disabled={pending} aria-expanded={open}>
        {pending ? <span className="spin" aria-hidden /> : null}
        {label}
      </button>
      {open && (
        <div className="reason-pop">
          <div className="chips">
            {chips.map((c) => (
              <button key={c} type="button" className="chip" onClick={() => go(c)}>
                {c}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) go(text.trim());
            }}
          >
            <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} />
          </form>
        </div>
      )}
    </span>
  );
}

/** Single-line inline edit with Save. */
export function InlineEdit({ value, onSave, placeholder, wide }: { value: string; onSave: (v: string) => Promise<ActResult>; placeholder?: string; wide?: boolean }) {
  const [v, setV] = useState(value);
  const [pending, start] = useTransition();
  return (
    <form
      className="inline-edit"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await onSave(v);
          toast(r.message, r.ok);
        });
      }}
    >
      <input className={wide ? "wide" : ""} value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} />
      <button className="btn btn-sm" disabled={pending || v === value}>
        {pending ? <span className="spin" aria-hidden /> : null}Save
      </button>
    </form>
  );
}

export function JobEditor({ prompt, onSave }: { prompt: string; onSave: (prompt: string, note: string) => Promise<ActResult> }) {
  const [v, setV] = useState(prompt);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  useEffect(() => setV(prompt), [prompt]);
  return (
    <form
      className="job-editor"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await onSave(v, note);
          toast(r.message, r.ok);
          setNote("");
        });
      }}
    >
      <textarea value={v} onChange={(e) => setV(e.target.value)} rows={9} aria-label="Job description" />
      <div className="row gap">
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What changed? (optional)" />
        <button className="btn" disabled={pending || v.trim() === prompt.trim()}>
          {pending ? <span className="spin" aria-hidden /> : null}Save new version
        </button>
      </div>
    </form>
  );
}

export function FactForm({ onAdd }: { onAdd: (brand: string, category: string, statement: string, source: string) => Promise<ActResult> }) {
  const [brand, setBrand] = useState("ornate");
  const [category, setCategory] = useState("credential");
  const [statement, setStatement] = useState("");
  const [source, setSource] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="fact-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!statement.trim()) return;
        start(async () => {
          const r = await onAdd(brand, category, statement.trim(), source.trim());
          toast(r.message, r.ok);
          if (r.ok) {
            setStatement("");
            setSource("");
          }
        });
      }}
    >
      <select value={brand} onChange={(e) => setBrand(e.target.value)} aria-label="Brand">
        <option value="ornate">Ornate Solar</option>
        <option value="unityess">UnityESS</option>
        <option value="both">Both</option>
      </select>
      <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
        {["credential", "number", "product", "customer", "other"].map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
      <input className="grow" value={statement} onChange={(e) => setStatement(e.target.value)} placeholder="The fact, exactly as it may be published" />
      <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Source" />
      <button className="btn" disabled={pending}>
        Add (approved)
      </button>
    </form>
  );
}

/** Opens the command chat with a starter text. */
export function ChatButton({ text, label, className = "btn btn-ghost btn-sm" }: { text: string; label: string; className?: string }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new CustomEvent("omos-chat-open", { detail: text }))}>
      {label}
    </button>
  );
}
