"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export type NavItem = { href: string; label: string; badge?: number | string; muted?: boolean };
export type NavGroup = { title?: string; items: NavItem[] };

export default function Nav({ groups, userName, signOutSlot }: { groups: NavGroup[]; userName: string; signOutSlot: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
  return (
    <>
      <div className="topbar">
        <button className="icon-btn" onClick={() => setOpen((o) => !o)} aria-label="Menu" aria-expanded={open}>
          ☰
        </button>
        <Link href="/" className="brand-mark">Ornate <span>Marketing OS</span></Link>
      </div>
      <nav className={`sidebar ${open ? "open" : ""}`} onClick={() => setOpen(false)}>
        <Link href="/" className="brand-mark desk">Ornate <span>Marketing OS</span></Link>
        {groups.map((g, i) => (
          <div key={i} className="nav-group">
            {g.title && <div className="nav-title">{g.title}</div>}
            {g.items.map((it) => (
              <Link key={it.href} href={it.href} className={`nav-link ${isActive(it.href) ? "active" : ""} ${it.muted ? "muted-link" : ""}`}>
                <span>{it.label}</span>
                {it.badge ? <span className="nav-badge">{it.badge}</span> : null}
              </Link>
            ))}
          </div>
        ))}
        <div className="nav-foot">
          <span className="small muted">{userName}</span>
          {signOutSlot}
        </div>
      </nav>
    </>
  );
}
