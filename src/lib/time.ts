const TZ = "Asia/Kolkata";

/** YYYY-MM-DD in India time, offset by `days`. */
export function istDate(days = 0, from = new Date()): string {
  const d = new Date(from.getTime() + days * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function istHour(from = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(from));
}

/** Start of the IST day `date` (YYYY-MM-DD) as a Date (UTC instant). */
export function istDayStart(date: string): Date {
  return new Date(`${date}T00:00:00+05:30`);
}

export function istDateOf(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  return istDate(0, new Date(d));
}

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "";
  return new Intl.DateTimeFormat("en-IN", { timeZone: TZ, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(d));
}

export function fmtDay(date: string): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }).format(istDayStart(date));
}

/** Parse "2026-11-18 10:00" / ISO as IST. */
export function parseIst(s: string): Date {
  if (/[zZ]|[+-]\d\d:\d\d$/.test(s)) return new Date(s);
  const [d, t = "10:00"] = s.trim().split(/[ T]/);
  return new Date(`${d}T${t.length === 5 ? t + ":00" : t}+05:30`);
}
