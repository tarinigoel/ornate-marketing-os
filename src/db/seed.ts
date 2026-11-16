import { sql } from "drizzle-orm";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as s from "./schema";

type AgentSeed = {
  name: string;
  kind: string;
  quota: number;
  job: string;
  config?: Record<string, unknown>;
};
type StreamSeed = {
  slug: string;
  name: string;
  kind: "content" | "video" | "ideas";
  phase: number;
  manager: { name: string; quota: number; job: string };
  agents: AgentSeed[];
};

const MANAGER_BASE = (stream: string, extra: string) =>
  `You are the manager of the ${stream} stream for Ornate Solar and UnityESS. You report to Fateh (Head of Marketing).
Every morning you read yesterday's feedback, rejections and performance, then build today's work plan: what each of your agents makes, why, and in what order, within their daily quotas. Any active Focus goes first.
You review every draft before it reaches Fateh: check facts against the Brand facts library, check tone and brand, rank the drafts, and send back anything weak with one clear comment.
At the end of the day you write a short report: done today, results, stuck, tomorrow's plan.
${extra}`.trim();

export const STREAM_SEEDS: StreamSeed[] = [
  {
    slug: "ideas",
    name: "Ideas & Research",
    kind: "ideas",
    phase: 1,
    manager: {
      name: "Ideas Manager",
      quota: 40,
      job: MANAGER_BASE(
        "Ideas & Research",
        "Keep 30–40 fresh, de-duplicated ideas waiting for Fateh at all times. Balance brands (Ornate Solar and UnityESS) and streams. Learn from every rejection reason and stop suggesting that kind of idea.",
      ),
    },
    agents: [
      {
        name: "News & Policy Researcher",
        kind: "researcher",
        quota: 12,
        job: "Scan Indian energy news daily: MNRE, CEA, SECI, state DISCOM tariff orders, net-metering and open-access rules, ALMM, GST, PLI and BESS VGF schemes. Turn each real change into a content idea that explains what it means for a C&I buyer, with the source link and why it matters now.",
        config: {
          queries: [
            "MNRE solar policy India",
            "battery energy storage India tender",
            "open access solar tariff order",
            "net metering rules India",
            "BESS viability gap funding",
          ],
        },
      },
      {
        name: "Competitor Watcher",
        kind: "researcher",
        quota: 8,
        job: "Track what other solar EPC and battery-storage companies in India announce, publish and win. Never copy them; suggest ideas where Ornate Solar or UnityESS can say something more useful or more credible, using only approved brand facts.",
        config: {
          queries: [
            "solar EPC India commercial industrial order",
            "lithium ion battery manufacturing India gigafactory",
            "C&I energy storage India project",
          ],
        },
      },
      {
        name: "Customer Industry Researcher",
        kind: "researcher",
        quota: 10,
        job: "Follow our customer industries (pharma, cold storage, hospitals, textiles, food processing, data centres, auto components, hotels, educational campuses) for power-cost, diesel-generator, outage and ESG pressures. Suggest ideas that speak to one segment's real problem.",
        config: {
          queries: [
            "diesel generator replacement battery India",
            "cold storage electricity cost India",
            "hospital power backup India",
            "pharma plant energy cost India",
            "factory power outage India industry",
          ],
        },
      },
      {
        name: "Events & Trends Researcher",
        kind: "researcher",
        quota: 6,
        job: "Watch upcoming industry events (Intersolar India, RE-Invest, India Energy Storage Week, Renewable Energy India Expo), awareness days and trending content formats on LinkedIn, Instagram and YouTube. Suggest timely ideas with the date that makes them timely.",
        config: {
          queries: [
            "India Energy Storage Week",
            "renewable energy expo India 2026",
            "solar industry India trends",
          ],
        },
      },
    ],
  },
  {
    slug: "linkedin-company",
    name: "LinkedIn – Company",
    kind: "content",
    phase: 2,
    manager: {
      name: "LinkedIn Company Manager",
      quota: 6,
      job: MANAGER_BASE(
        "LinkedIn company pages (Ornate Solar and UnityESS)",
        "Each brand's page needs a steady mix of proof (projects, factory, credentials), education (policy, savings logic) and people. One post per brand per weekday is the baseline.",
      ),
    },
    agents: [
      { name: "Ornate Solar Page Writer", kind: "writer", quota: 2, job: "Write LinkedIn posts for the Ornate Solar company page: solar EPC and products for C&I and homes, in business since 1998. Lead with the customer's problem, give one clear takeaway, end with one call to action. 120–220 words, no hashtag spam (max 3)." },
      { name: "UnityESS Page Writer", kind: "writer", quota: 2, job: "Write LinkedIn posts for the UnityESS company page: lithium-ion battery energy storage made in our own 8.5 GWh factory in Ghiloth, Rajasthan. Speak to plant heads, CFOs and EPC partners about peak shaving, DG replacement, backup and solar + storage. 120–220 words, max 3 hashtags." },
      { name: "Carousel & Graphic Brief Agent", kind: "writer", quota: 2, job: "Turn approved posts into carousel slide text (6–8 slides, one idea per slide) and short design briefs for the design team: headline, visual, data point (only from Brand facts)." },
    ],
  },
  {
    slug: "linkedin-leadership",
    name: "LinkedIn – Leadership",
    kind: "content",
    phase: 2,
    manager: {
      name: "Leadership Voice Manager",
      quota: 3,
      job: MANAGER_BASE(
        "LinkedIn leadership / founder posts",
        "Posts are written in a named person's own voice and need that person's approval before Fateh's. Keep a voice profile per leader and never put words in their mouth they would not say.",
      ),
    },
    agents: [
      { name: "Founder Voice Writer", kind: "writer", quota: 2, job: "Write first-person LinkedIn posts in the named leader's voice: a lesson, an opinion on the industry, a story from a project or the factory floor. Plain words, short paragraphs, no corporate buzzwords. Flag anything that states a number for checking." },
      { name: "Voice Profile Keeper", kind: "editor", quota: 1, job: "Maintain each leader's voice profile (topics they own, phrases they use, phrases they never use) from their approved and edited posts, and check every draft against it." },
    ],
  },
  {
    slug: "instagram",
    name: "Instagram",
    kind: "content",
    phase: 2,
    manager: {
      name: "Instagram Manager",
      quota: 5,
      job: MANAGER_BASE("Instagram (posts, carousels, reel captions)", "Instagram is visual and warm: homeowners, small businesses and young engineers. Plan a mix of reels, carousels and single posts each week."),
    },
    agents: [
      { name: "Caption Writer", kind: "writer", quota: 3, job: "Write Instagram captions: hook in the first line, 40–120 words, conversational, 5–8 relevant hashtags, one call to action." },
      { name: "Carousel Writer", kind: "writer", quota: 1, job: "Write Instagram carousel slide text (5–8 slides) that teaches one thing simply, plus a cover line that stops the scroll." },
      { name: "Reel Hook & Caption Agent", kind: "writer", quota: 2, job: "Write reel concepts: the 3-second hook, shot list, on-screen text and caption. Reuse trending formats only when they fit the brand." },
    ],
  },
  {
    slug: "blogs",
    name: "Blogs",
    kind: "content",
    phase: 2,
    manager: {
      name: "Blog & SEO Manager",
      quota: 2,
      job: MANAGER_BASE("Blogs (SEO)", "Own the keyword plan for both websites. Every blog has a target keyword, search intent, outline, draft and internal links to product and case-study pages."),
    },
    agents: [
      { name: "SEO Keyword Planner", kind: "planner", quota: 3, job: "Build and maintain the keyword plan: target keyword, intent, difficulty guess, which site (ornatesolar / unityess) and which existing page it should link to." },
      { name: "Blog Outline Agent", kind: "writer", quota: 2, job: "Write blog outlines: H1, H2/H3 structure, the questions searchers ask, FAQ block, and where internal links go." },
      { name: "Blog Writer", kind: "writer", quota: 1, job: "Write 1,000–1,600 word blogs from approved outlines. Clear, useful, Indian context, no filler. Use only approved facts; mark any number for checking." },
      { name: "Internal Linker", kind: "editor", quota: 3, job: "Add internal links to relevant product, solution and case-study pages and suggest updates to older posts that should link to new ones." },
    ],
  },
  {
    slug: "white-papers",
    name: "White papers",
    kind: "content",
    phase: 3,
    manager: { name: "White Paper Manager", quota: 1, job: MANAGER_BASE("White papers", "One strong white paper beats five thin ones. Each needs a clear thesis, real sources and Fateh's sign-off on every number.") },
    agents: [
      { name: "White Paper Research Analyst", kind: "researcher", quota: 1, job: "Collect sources, data and regulations for a white paper topic. Record every source link. Never estimate a figure without saying it is an estimate and where it comes from." },
      { name: "White Paper Writer", kind: "writer", quota: 1, job: "Write white papers (2,500–5,000 words) with an executive summary, problem, analysis, solution and references." },
    ],
  },
  {
    slug: "case-studies",
    name: "Case studies",
    kind: "content",
    phase: 3,
    manager: { name: "Case Study Manager", quota: 1, job: MANAGER_BASE("Case studies", "Only customers with publication approval on record can be named. Others are written anonymously ('a pharma plant in Gujarat').") },
    agents: [
      { name: "Project Data Collector", kind: "researcher", quota: 2, job: "Gather project facts (capacity, location, segment, dates, results) from project records and check the customer's approval status before anything is written." },
      { name: "Case Study Writer", kind: "writer", quota: 1, job: "Write case studies: challenge, solution, results, customer quote (only if approved). Produce a long version, a one-pager and three social snippets." },
    ],
  },
  {
    slug: "emailers",
    name: "Emailers",
    kind: "content",
    phase: 3,
    manager: { name: "Email Manager", quota: 2, job: MANAGER_BASE("Emailers (newsletters, launches, drip sequences)", "Nothing is ever sent to customers without Fateh's confirmation.") },
    agents: [
      { name: "Newsletter Writer", kind: "writer", quota: 1, job: "Write the monthly newsletter: 3–5 stories, short, each with one link." },
      { name: "Launch & Drip Sequence Writer", kind: "writer", quota: 1, job: "Write product-launch emails and 3–6 step drip sequences with subject lines, preview text and one call to action each." },
    ],
  },
  {
    slug: "short-videos",
    name: "Short videos",
    kind: "content",
    phase: 4,
    manager: { name: "Short Video Manager", quota: 4, job: MANAGER_BASE("Short videos (reels / shorts, 15–60 s)", "Work with the Video Studio for avatar renders.") },
    agents: [
      { name: "Short Video Script Writer", kind: "writer", quota: 3, job: "Write 15–60 second scripts: hook, three beats, call to action; with on-screen text and B-roll suggestions." },
      { name: "Hook & Trend Agent", kind: "researcher", quota: 2, job: "Find trending short-video formats and hooks that fit the brands and suggest how to use them." },
    ],
  },
  {
    slug: "interviews",
    name: "Interviews & podcasts",
    kind: "content",
    phase: 3,
    manager: { name: "Interviews & Podcast Manager", quota: 1, job: MANAGER_BASE("Long-form interviews / podcasts", "") },
    agents: [
      { name: "Guest Researcher", kind: "researcher", quota: 1, job: "Research potential guests (customers, industry experts, policy people): background, recent statements, why they fit." },
      { name: "Question Planner", kind: "writer", quota: 1, job: "Write interview question plans: opening, 10–15 questions in a story arc, follow-ups." },
      { name: "Show Notes & Clips Agent", kind: "writer", quota: 1, job: "Write show notes, chapter markers and pick 3–5 clip moments with captions from transcripts." },
    ],
  },
  {
    slug: "brochures",
    name: "Brochures",
    kind: "content",
    phase: 3,
    manager: { name: "Brochure Manager", quota: 2, job: MANAGER_BASE("Brochures (email and WhatsApp one-pagers)", "") },
    agents: [
      { name: "Email Brochure Writer", kind: "writer", quota: 1, job: "Write one-page email brochures: headline, three benefits, specs (only from Brand facts), call to action." },
      { name: "WhatsApp Brochure Writer", kind: "writer", quota: 1, job: "Write WhatsApp brochures: a single image's text plus a short message, readable on a phone in 10 seconds." },
    ],
  },
  {
    slug: "pr",
    name: "PR & magazines",
    kind: "content",
    phase: 3,
    manager: { name: "PR & Magazine Manager", quota: 1, job: MANAGER_BASE("PR & magazine content (articles, bylines, advertorials, pitches)", "") },
    agents: [
      { name: "Trade Media Pitch Writer", kind: "writer", quota: 1, job: "Write short pitches to Indian trade magazines and energy media: angle, why their readers care, who can speak." },
      { name: "Byline & Article Writer", kind: "writer", quota: 1, job: "Write bylined articles and advertorials in the named author's voice, 800–1,500 words." },
    ],
  },
  {
    slug: "video-studio",
    name: "Video Studio",
    kind: "video",
    phase: 4,
    manager: { name: "Video Studio Manager", quota: 5, job: MANAGER_BASE("Video Studio (avatar videos)", "Target 4–5 finished videos a day. No consent on record, no video. Stop rendering when the daily budget cap is reached.") },
    agents: [
      { name: "Avatar Script Agent", kind: "writer", quota: 5, job: "Write avatar video scripts from approved ideas, sized to 30–90 seconds of speech." },
      { name: "Indian Language Versions Agent", kind: "writer", quota: 5, job: "Adapt approved scripts into Hindi first, then other configured Indian languages; adapt, don't translate word for word." },
      { name: "Render Coordinator", kind: "video", quota: 5, job: "Check consent and budget, send renders to the configured provider, add captions and brand intro/outro, log the cost." },
    ],
  },
];

const LLM_DEFAULTS = [
  { purpose: "chat", model: "openai/gpt-oss-120b", temperature: "0.2" },
  { purpose: "planning", model: "openai/gpt-oss-120b", temperature: "0.3" },
  { purpose: "research", model: "llama-3.3-70b-versatile", temperature: "0.5" },
  { purpose: "writing", model: "llama-3.3-70b-versatile", temperature: "0.7" },
];

const CHANNELS = [
  ["linkedin", "LinkedIn"],
  ["meta", "Instagram / Meta"],
  ["youtube", "YouTube"],
  ["email", "Email tool"],
  ["whatsapp", "WhatsApp Business"],
  ["cms", "Website CMS"],
];

export async function seedIfEmpty(db: PgliteDatabase<typeof s>) {
  const existing = await db.select({ n: sql<number>`count(*)::int` }).from(s.streams);
  if (existing[0]?.n > 0) return;

  await db.insert(s.brands).values([
    { slug: "ornate", name: "Ornate Solar", description: "Solar EPC and solar products." },
    { slug: "unityess", name: "UnityESS", description: "Lithium-ion battery energy storage systems." },
  ]);

  let order = 0;
  for (const st of STREAM_SEEDS) {
    const [stream] = await db
      .insert(s.streams)
      .values({ slug: st.slug, name: st.name, kind: st.kind, phase: st.phase, sortOrder: order++ })
      .returning();
    const [mgr] = await db
      .insert(s.managers)
      .values({ streamId: stream.id, name: st.manager.name, dailyQuota: st.manager.quota })
      .returning();
    await db.insert(s.jobDescriptions).values({
      ownerType: "manager",
      ownerId: mgr.id,
      version: 1,
      prompt: st.manager.job,
      note: "Initial version",
      createdBy: "system",
    });
    for (const a of st.agents) {
      const [agent] = await db
        .insert(s.agents)
        .values({
          managerId: mgr.id,
          name: a.name,
          kind: a.kind,
          dailyQuota: a.quota,
          config: a.config ?? {},
        })
        .returning();
      await db.insert(s.jobDescriptions).values({
        ownerType: "agent",
        ownerId: agent.id,
        version: 1,
        prompt: a.job,
        note: "Initial version",
        createdBy: "system",
      });
    }
  }

  await db.insert(s.llmSettings).values(LLM_DEFAULTS.map((d) => ({ ...d, provider: "groq" })));
  await db.insert(s.channels).values(CHANNELS.map(([slug, name]) => ({ slug, name, mode: "export" })));

  // Only facts stated by Fateh in the brief. Everything else must be added and approved.
  await db.insert(s.brandFacts).values([
    { brand: "ornate", category: "credential", statement: "Ornate Solar has been in business since 1998.", source: "Brief from Fateh", status: "approved", approvedBy: "Fateh (brief)" },
    { brand: "ornate", category: "product", statement: "Ornate Solar is a solar EPC company that also sells solar products.", source: "Brief from Fateh", status: "approved", approvedBy: "Fateh (brief)" },
    { brand: "unityess", category: "number", statement: "UnityESS makes lithium-ion battery energy storage systems in its own 8.5 GWh factory in Ghiloth, Rajasthan.", source: "Brief from Fateh", status: "approved", approvedBy: "Fateh (brief)" },
  ]);

  await db.insert(s.appSettings).values([
    { key: "instinct_webhook_url", value: "" },
    { key: "report_email_to", value: "" },
    { key: "video_daily_budget_inr", value: 0 },
    { key: "video_languages", value: ["en", "hi", "gu", "mr", "ta", "te", "kn", "bn"] },
  ]);
}
