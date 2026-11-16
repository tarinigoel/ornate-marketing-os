"use client";

import { usePathname, useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "./ui";

type Change = { commandId: number; summary: string; undone?: boolean };
type Pending = { commandId: number; summary: string; status?: string };
type Msg = { id: number | string; role: "user" | "assistant"; content: string; meta?: { changes?: Change[]; pending?: Pending[]; errors?: string[] } };

const EXAMPLES = [
  "Give me 10 new ideas on DG replacement and add the best 5 to Ideas",
  "Instagram manager: focus on cold storage until 30 Nov",
  "Pause the Competitor Watcher",
  "Raise the Caption Writer's quota to 4 a day",
  "What did the team make this week?",
];

function newSessionId() {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p, i) =>
    p.startsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : p.startsWith("`") ? <code key={i}>{p.slice(1, -1)}</code> : <Fragment key={i}>{p}</Fragment>,
  );
}

function Rich({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) blocks.push(<ul key={`u${blocks.length}`}>{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>);
    list = [];
  };
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)/);
    if (m) list.push(m[1]);
    else {
      flush();
      if (line.trim()) blocks.push(<p key={`p${blocks.length}`}>{inline(line.replace(/^#+\s*/, ""))}</p>);
    }
  }
  flush();
  return <>{blocks}</>;
}

export default function ChatWidget({ userName }: { userName: string }) {
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string>("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recRef = useRef<{ stop: () => void } | null>(null);

  // Restore the conversation (kept across pages and reloads).
  useEffect(() => {
    let id = "";
    try {
      id = localStorage.getItem("omos-chat-session") ?? "";
      if (localStorage.getItem("omos-chat-open") === "1") setOpen(true);
    } catch {}
    if (!id) {
      id = newSessionId();
      try {
        localStorage.setItem("omos-chat-session", id);
      } catch {}
    }
    setSessionId(id);
    fetch(`/api/chat?sessionId=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((d) => setMessages(d.messages ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("omos-chat-open", open ? "1" : "0");
    } catch {}
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, busy, open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    const onOpen = (e: Event) => {
      setOpen(true);
      const text = (e as CustomEvent).detail as string | undefined;
      if (text) setInput(text);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("omos-chat-open", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("omos-chat-open", onOpen);
    };
  }, []);

  const send = useCallback(
    async (text: string) => {
      const t = text.trim();
      if (!t || busy || !sessionId) return;
      setInput("");
      setMessages((m) => [...m, { id: `u${Date.now()}`, role: "user", content: t }]);
      setBusy(true);
      try {
        const res = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId, message: t, path: pathname }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Something went wrong");
        setMessages((m) => [...m, data]);
        if (data.meta?.changes?.length) router.refresh();
      } catch (e) {
        setMessages((m) => [...m, { id: `e${Date.now()}`, role: "assistant", content: `Sorry, that failed: ${(e as Error).message}` }]);
      } finally {
        setBusy(false);
      }
    },
    [busy, sessionId, pathname, router],
  );

  const undo = async (commandId: number) => {
    const res = await fetch("/api/chat/undo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ commandId }) });
    const d = await res.json();
    if (!res.ok) return toast(d.error ?? "Undo failed", false);
    setMessages((ms) => ms.map((m) => ({ ...m, meta: m.meta && { ...m.meta, changes: m.meta.changes?.map((c) => (c.commandId === commandId ? { ...c, undone: true } : c)) } })));
    toast("Undone");
    router.refresh();
  };

  const decide = async (commandId: number, confirm: boolean) => {
    const res = await fetch("/api/chat/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ commandId, confirm }) });
    const d = await res.json();
    if (!res.ok) return toast(d.error ?? "Failed", false);
    setMessages((ms) => ms.map((m) => ({ ...m, meta: m.meta && { ...m.meta, pending: m.meta.pending?.map((p) => (p.commandId === commandId ? { ...p, status: d.status, summary: d.summary } : p)) } })));
    toast(d.summary);
    router.refresh();
  };

  const toggleMic = () => {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const W = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const SR = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!SR) return toast("Voice input isn't supported in this browser (try Chrome or Edge).", false);
    const rec = new SR();
    rec.lang = "en-IN";
    rec.interimResults = true;
    rec.continuous = false;
    const base = input ? input.trimEnd() + " " : "";
    let finalText = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      setInput(base + finalText + interim);
    };
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
      if (finalText.trim()) send(base + finalText);
    };
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  const reset = () => {
    const id = newSessionId();
    try {
      localStorage.setItem("omos-chat-session", id);
    } catch {}
    setSessionId(id);
    setMessages([]);
  };

  return (
    <>
      {!open && (
        <button className="chat-fab" onClick={() => setOpen(true)} aria-label="Open command chat (Ctrl+K)">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span>Command</span>
          <kbd>⌘K</kbd>
        </button>
      )}
      {open && (
        <section className="chat-panel" aria-label="Command chat">
          <header className="chat-head">
            <div>
              <strong>Command</strong>
              <span className="muted small"> · runs the whole portal</span>
            </div>
            <div className="row gap-s">
              <button className="btn btn-ghost btn-sm" onClick={reset} title="Start a new conversation">
                New
              </button>
              <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close chat">
                ×
              </button>
            </div>
          </header>
          <div className="chat-body">
            {messages.length === 0 && (
              <div className="chat-empty">
                <p>Hi {userName.split(" ")[0]}. Tell me what to do, in plain English.</p>
                <div className="chips col">
                  {EXAMPLES.map((e) => (
                    <button key={e} className="chip" onClick={() => send(e)}>
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`msg msg-${m.role}`}>
                <div className="bubble">{m.role === "assistant" ? <Rich text={m.content} /> : m.content}</div>
                {!!m.meta?.changes?.length && (
                  <ul className="changes">
                    {m.meta.changes.map((c) => (
                      <li key={c.commandId} className={c.undone ? "undone" : ""}>
                        <span>{c.summary}</span>
                        {c.undone ? <span className="muted small">undone</span> : <button className="link-btn" onClick={() => undo(c.commandId)}>Undo</button>}
                      </li>
                    ))}
                  </ul>
                )}
                {!!m.meta?.pending?.length && (
                  <ul className="changes pending">
                    {m.meta.pending.map((p) => (
                      <li key={p.commandId}>
                        <span>{p.summary}</span>
                        {p.status && p.status !== "pending_confirm" ? (
                          <span className="muted small">{p.status === "done" ? "done" : p.status}</span>
                        ) : (
                          <span className="row gap-s">
                            <button className="btn btn-sm" onClick={() => decide(p.commandId, true)}>Confirm</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => decide(p.commandId, false)}>Cancel</button>
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            {busy && (
              <div className="msg msg-assistant">
                <div className="bubble typing" aria-label="Working">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
          <form
            className="chat-input"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              rows={2}
              placeholder={listening ? "Listening…" : "Type or speak a command…"}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
            />
            <div className="chat-actions">
              <button type="button" className={`icon-btn mic ${listening ? "on" : ""}`} onClick={toggleMic} aria-label={listening ? "Stop listening" : "Speak a command"} title="Voice input">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <rect x="9" y="2" width="6" height="12" rx="3" />
                  <path d="M5 10a7 7 0 0 0 14 0M12 17v5" />
                </svg>
              </button>
              <button className="btn" disabled={busy || !input.trim()}>
                Send
              </button>
            </div>
          </form>
        </section>
      )}
    </>
  );
}

type SpeechRec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: (e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void;
  onend: () => void;
  onerror: () => void;
};
