import {
  pgTable,
  integer,
  text,
  timestamp,
  jsonb,
  boolean,
  numeric,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

const id = () => integer("id").primaryKey().generatedAlwaysAsIdentity();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/* ---------- People & org ---------- */

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name"),
  role: text("role").notNull().default("member"), // head | approver | member
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const brands = pgTable("brands", {
  id: id(),
  slug: text("slug").notNull().unique(), // ornate | unityess
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
});

export const streams = pgTable("streams", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("content"), // content | video | ideas
  phase: integer("phase").notNull().default(1), // build phase in which the pipeline goes live
  sortOrder: integer("sort_order").notNull().default(0),
});

export const managers = pgTable("managers", {
  id: id(),
  streamId: integer("stream_id").notNull().references(() => streams.id),
  name: text("name").notNull(),
  status: text("status").notNull().default("active"), // active | paused | retired
  dailyQuota: integer("daily_quota").notNull().default(5),
  createdAt: createdAt(),
});

export const agents = pgTable("agents", {
  id: id(),
  managerId: integer("manager_id").notNull().references(() => managers.id),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("writer"), // writer | researcher | planner | editor | video
  status: text("status").notNull().default("active"),
  dailyQuota: integer("daily_quota").notNull().default(3),
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/** Versioned prompts. The current one is the highest version for an owner. */
export const jobDescriptions = pgTable(
  "job_descriptions",
  {
    id: id(),
    ownerType: text("owner_type").notNull(), // manager | agent
    ownerId: integer("owner_id").notNull(),
    version: integer("version").notNull(),
    prompt: text("prompt").notNull(),
    note: text("note"),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("jd_owner_version").on(t.ownerType, t.ownerId, t.version)],
);

export const focuses = pgTable("focuses", {
  id: id(),
  managerId: integer("manager_id").notNull().references(() => managers.id),
  kind: text("kind").notNull(), // theme | product | segment | region | campaign
  value: text("value").notNull(),
  untilDate: text("until_date").notNull(), // YYYY-MM-DD (IST)
  active: boolean("active").notNull().default(true),
  createdBy: text("created_by").notNull(),
  createdAt: createdAt(),
});

/* ---------- Planning, runs, reports ---------- */

export const workPlans = pgTable(
  "work_plans",
  {
    id: id(),
    managerId: integer("manager_id").notNull().references(() => managers.id),
    date: text("date").notNull(),
    summary: text("summary").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("plan_manager_date").on(t.managerId, t.date)],
);

export const planItems = pgTable("plan_items", {
  id: id(),
  planId: integer("plan_id").notNull().references(() => workPlans.id),
  agentId: integer("agent_id").references(() => agents.id),
  position: integer("position").notNull().default(0),
  title: text("title").notNull(),
  why: text("why").notNull().default(""),
  brand: text("brand"),
  status: text("status").notNull().default("planned"), // planned | in_progress | done | skipped
  ideaId: integer("idea_id"),
  contentItemId: integer("content_item_id"),
});

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: id(),
    agentId: integer("agent_id"),
    managerId: integer("manager_id"),
    kind: text("kind").notNull(), // plan | research | draft | review | report
    status: text("status").notNull().default("ok"), // ok | error | skipped
    summary: text("summary").notNull().default(""),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("runs_agent").on(t.agentId), index("runs_manager").on(t.managerId)],
);

export const dailyReports = pgTable("daily_reports", {
  id: id(),
  managerId: integer("manager_id"), // null = Head's all-company summary
  date: text("date").notNull(),
  done: text("done").notNull().default(""),
  results: text("results").notNull().default(""),
  stuck: text("stuck").notNull().default(""),
  tomorrow: text("tomorrow").notNull().default(""),
  agentLines: jsonb("agent_lines").$type<{ agent: string; line: string }[]>().notNull().default([]),
  deliveredTo: jsonb("delivered_to").$type<string[]>().notNull().default([]),
  createdAt: createdAt(),
});

/* ---------- Ideas & content ---------- */

export type SourceLink = { title: string; url: string };

export const ideas = pgTable(
  "ideas",
  {
    id: id(),
    title: text("title").notNull(),
    detail: text("detail").notNull().default(""),
    streams: jsonb("streams").$type<string[]>().notNull().default([]),
    whyNow: text("why_now").notNull().default(""),
    sources: jsonb("sources").$type<SourceLink[]>().notNull().default([]),
    brand: text("brand").notNull().default("ornate"), // ornate | unityess | both
    status: text("status").notNull().default("waiting"), // waiting | approved | rejected
    rejectReason: text("reject_reason"),
    score: integer("score").notNull().default(50),
    fingerprint: text("fingerprint").notNull().default(""),
    agentId: integer("agent_id"),
    managerId: integer("manager_id"), // assigned manager once approved
    decidedBy: text("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("ideas_status").on(t.status)],
);

export const STAGES = [
  "idea",
  "approved_idea",
  "drafting",
  "in_review",
  "waiting_for_me",
  "scheduled",
  "published",
  "measured",
] as const;
export type Stage = (typeof STAGES)[number];

export const contentItems = pgTable(
  "content_items",
  {
    id: id(),
    streamId: integer("stream_id").notNull().references(() => streams.id),
    brand: text("brand").notNull().default("ornate"),
    title: text("title").notNull(),
    brief: text("brief").notNull().default(""),
    format: text("format").notNull().default("post"),
    language: text("language").notNull().default("en"),
    parentId: integer("parent_id"),
    ideaId: integer("idea_id"),
    agentId: integer("agent_id"),
    stage: text("stage").$type<Stage>().notNull().default("idea"),
    body: text("body").notNull().default(""),
    hasNumbers: boolean("has_numbers").notNull().default(false),
    factIds: jsonb("fact_ids").$type<number[]>().notNull().default([]),
    dueDate: text("due_date"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdBy: text("created_by").notNull().default("system"),
    stageChangedAt: timestamp("stage_changed_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index("items_stream_stage").on(t.streamId, t.stage)],
);

export const itemVersions = pgTable("item_versions", {
  id: id(),
  itemId: integer("item_id").notNull().references(() => contentItems.id),
  version: integer("version").notNull(),
  body: text("body").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: createdAt(),
});

export const assets = pgTable("assets", {
  id: id(),
  itemId: integer("item_id"),
  kind: text("kind").notNull(), // image | pdf | video | audio | other
  name: text("name").notNull(),
  url: text("url").notNull(),
  createdAt: createdAt(),
});

export const brandFacts = pgTable("brand_facts", {
  id: id(),
  brand: text("brand").notNull(), // ornate | unityess | both
  category: text("category").notNull().default("credential"), // credential | number | product | customer | other
  statement: text("statement").notNull(),
  source: text("source").notNull().default(""),
  status: text("status").notNull().default("pending"), // approved | pending | retired
  approvedBy: text("approved_by"),
  expiresOn: text("expires_on"),
  createdAt: createdAt(),
});

export const approvals = pgTable("approvals", {
  id: id(),
  subjectType: text("subject_type").notNull(), // item | idea
  subjectId: integer("subject_id").notNull(),
  level: text("level").notNull(), // manager | head
  decision: text("decision").notNull(), // approved | rejected | changes
  rank: integer("rank"),
  comment: text("comment"),
  decidedBy: text("decided_by").notNull(),
  createdAt: createdAt(),
});

/* ---------- Video (phase 4) ---------- */

export const people = pgTable("people", {
  id: id(),
  name: text("name").notNull(),
  title: text("title").notNull().default(""),
  email: text("email"),
  createdAt: createdAt(),
});

export const consents = pgTable("consents", {
  id: id(),
  personId: integer("person_id").notNull().references(() => people.id),
  scope: text("scope").notNull(), // face | voice | face_and_voice
  languages: jsonb("languages").$type<string[]>().notNull().default([]),
  documentUrl: text("document_url").notNull(),
  signedOn: text("signed_on").notNull(),
  expiresOn: text("expires_on").notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  recordedBy: text("recorded_by").notNull(),
  createdAt: createdAt(),
});

export const renders = pgTable("renders", {
  id: id(),
  itemId: integer("item_id"),
  provider: text("provider").notNull(),
  language: text("language").notNull().default("en"),
  status: text("status").notNull().default("queued"),
  costInr: numeric("cost_inr").notNull().default("0"),
  createdAt: createdAt(),
});

/* ---------- Publishing & metrics (phase 5) ---------- */

export const channels = pgTable("channels", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  mode: text("mode").notNull().default("export"), // export | api
  enabled: boolean("enabled").notNull().default(true),
});

export const publications = pgTable("publications", {
  id: id(),
  itemId: integer("item_id").notNull(),
  channelId: integer("channel_id"),
  url: text("url"),
  approvalId: integer("approval_id").notNull(),
  publishedBy: text("published_by").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
});

export const metrics = pgTable("metrics", {
  id: id(),
  publicationId: integer("publication_id").notNull(),
  date: text("date").notNull(),
  impressions: integer("impressions").notNull().default(0),
  engagements: integer("engagements").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
  leads: integer("leads").notNull().default(0),
});

/* ---------- System ---------- */

export const llmSettings = pgTable("llm_settings", {
  id: id(),
  purpose: text("purpose").notNull().unique(), // chat | planning | research | writing
  provider: text("provider").notNull().default("groq"),
  model: text("model").notNull(),
  temperature: numeric("temperature").notNull().default("0.4"),
});

export const llmCalls = pgTable("llm_calls", {
  id: id(),
  purpose: text("purpose").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  actor: text("actor").notNull(),
  promptTokens: integer("prompt_tokens").notNull().default(0),
  completionTokens: integer("completion_tokens").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
  durationMs: integer("duration_ms").notNull().default(0),
  ok: boolean("ok").notNull().default(true),
  error: text("error"),
  createdAt: createdAt(),
});

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: id(),
    sessionId: text("session_id").notNull(),
    userEmail: text("user_email").notNull(),
    role: text("role").notNull(), // user | assistant
    content: text("content").notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("chat_session").on(t.sessionId)],
);

export const chatCommands = pgTable("chat_commands", {
  id: id(),
  sessionId: text("session_id").notNull(),
  userEmail: text("user_email").notNull(),
  tool: text("tool").notNull(),
  args: jsonb("args").$type<Record<string, unknown>>().notNull().default({}),
  summary: text("summary").notNull().default(""),
  status: text("status").notNull().default("done"), // done | pending_confirm | cancelled | undone | error
  createdAt: createdAt(),
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    actorType: text("actor_type").notNull(), // human | agent | manager | chat | system
    actorName: text("actor_name").notNull(),
    action: text("action").notNull(), // insert | update | undo | publish | ...
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    summary: text("summary").notNull().default(""),
    before: jsonb("before"),
    after: jsonb("after"),
    commandId: integer("command_id"),
  },
  (t) => [index("audit_command").on(t.commandId), index("audit_at").on(t.at)],
);
