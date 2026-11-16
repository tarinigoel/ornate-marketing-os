import { NextResponse } from "next/server";
import { buildAllPlans, tick, writeAllReports } from "@/lib/planning";
import { researchTick } from "@/lib/research";

export const maxDuration = 300;

/** Woken every 30 min by GitHub Actions: Authorization: Bearer $CRON_SECRET */
export async function GET(req: Request, { params }: { params: Promise<{ job: string }> }) {
  return handle(req, (await params).job);
}
export async function POST(req: Request, { params }: { params: Promise<{ job: string }> }) {
  return handle(req, (await params).job);
}

async function handle(req: Request, job: string) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    let result: unknown;
    if (job === "tick") result = await tick();
    else if (job === "plans") result = await buildAllPlans({ force: new URL(req.url).searchParams.get("force") === "1" });
    else if (job === "research") result = await researchTick();
    else if (job === "reports") result = await writeAllReports();
    else return NextResponse.json({ error: `Unknown job ${job}` }, { status: 404 });
    return NextResponse.json({ ok: true, job, result });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
