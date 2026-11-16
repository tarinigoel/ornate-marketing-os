CREATE TABLE "agent_runs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "agent_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"agent_id" integer,
	"manager_id" integer,
	"kind" text NOT NULL,
	"status" text DEFAULT 'ok' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "agents_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"manager_id" integer NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'writer' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"daily_quota" integer DEFAULT 3 NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "approvals_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"subject_type" text NOT NULL,
	"subject_id" integer NOT NULL,
	"level" text NOT NULL,
	"decision" text NOT NULL,
	"rank" integer,
	"comment" text,
	"decided_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "assets_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"item_id" integer,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_type" text NOT NULL,
	"actor_name" text NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"summary" text DEFAULT '' NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"command_id" integer
);
--> statement-breakpoint
CREATE TABLE "brand_facts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "brand_facts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"brand" text NOT NULL,
	"category" text DEFAULT 'credential' NOT NULL,
	"statement" text NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"approved_by" text,
	"expires_on" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "brands_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	CONSTRAINT "brands_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "channels" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "channels_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"mode" text DEFAULT 'export' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "channels_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "chat_commands" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "chat_commands_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"session_id" text NOT NULL,
	"user_email" text NOT NULL,
	"tool" text NOT NULL,
	"args" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'done' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "chat_messages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"session_id" text NOT NULL,
	"user_email" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "consents_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"person_id" integer NOT NULL,
	"scope" text NOT NULL,
	"languages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"document_url" text NOT NULL,
	"signed_on" text NOT NULL,
	"expires_on" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"recorded_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "content_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"stream_id" integer NOT NULL,
	"brand" text DEFAULT 'ornate' NOT NULL,
	"title" text NOT NULL,
	"brief" text DEFAULT '' NOT NULL,
	"format" text DEFAULT 'post' NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"parent_id" integer,
	"idea_id" integer,
	"agent_id" integer,
	"stage" text DEFAULT 'idea' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"has_numbers" boolean DEFAULT false NOT NULL,
	"fact_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"due_date" text,
	"scheduled_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_by" text DEFAULT 'system' NOT NULL,
	"stage_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_reports" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "daily_reports_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"manager_id" integer,
	"date" text NOT NULL,
	"done" text DEFAULT '' NOT NULL,
	"results" text DEFAULT '' NOT NULL,
	"stuck" text DEFAULT '' NOT NULL,
	"tomorrow" text DEFAULT '' NOT NULL,
	"agent_lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"delivered_to" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "focuses" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "focuses_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"manager_id" integer NOT NULL,
	"kind" text NOT NULL,
	"value" text NOT NULL,
	"until_date" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ideas" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ideas_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"title" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"streams" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"why_now" text DEFAULT '' NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"brand" text DEFAULT 'ornate' NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"reject_reason" text,
	"score" integer DEFAULT 50 NOT NULL,
	"fingerprint" text DEFAULT '' NOT NULL,
	"agent_id" integer,
	"manager_id" integer,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_versions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "item_versions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"item_id" integer NOT NULL,
	"version" integer NOT NULL,
	"body" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_descriptions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "job_descriptions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"owner_type" text NOT NULL,
	"owner_id" integer NOT NULL,
	"version" integer NOT NULL,
	"prompt" text NOT NULL,
	"note" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_calls" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "llm_calls_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"purpose" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"actor" text NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"ok" boolean DEFAULT true NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_settings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "llm_settings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"purpose" text NOT NULL,
	"provider" text DEFAULT 'groq' NOT NULL,
	"model" text NOT NULL,
	"temperature" numeric DEFAULT '0.4' NOT NULL,
	CONSTRAINT "llm_settings_purpose_unique" UNIQUE("purpose")
);
--> statement-breakpoint
CREATE TABLE "managers" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "managers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"stream_id" integer NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"daily_quota" integer DEFAULT 5 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metrics" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "metrics_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"publication_id" integer NOT NULL,
	"date" text NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"engagements" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"leads" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "people_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "plan_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"plan_id" integer NOT NULL,
	"agent_id" integer,
	"position" integer DEFAULT 0 NOT NULL,
	"title" text NOT NULL,
	"why" text DEFAULT '' NOT NULL,
	"brand" text,
	"status" text DEFAULT 'planned' NOT NULL,
	"idea_id" integer,
	"content_item_id" integer
);
--> statement-breakpoint
CREATE TABLE "publications" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "publications_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"item_id" integer NOT NULL,
	"channel_id" integer,
	"url" text,
	"approval_id" integer NOT NULL,
	"published_by" text NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "renders" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "renders_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"item_id" integer,
	"provider" text NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"cost_inr" numeric DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "streams" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "streams_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'content' NOT NULL,
	"phase" integer DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "streams_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"email" text NOT NULL,
	"name" text,
	"role" text DEFAULT 'member' NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "work_plans" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "work_plans_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"manager_id" integer NOT NULL,
	"date" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_manager_id_managers_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."managers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_stream_id_streams_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."streams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "focuses" ADD CONSTRAINT "focuses_manager_id_managers_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."managers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_versions" ADD CONSTRAINT "item_versions_item_id_content_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."content_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managers" ADD CONSTRAINT "managers_stream_id_streams_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."streams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_plan_id_work_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."work_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_plans" ADD CONSTRAINT "work_plans_manager_id_managers_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."managers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "runs_agent" ON "agent_runs" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "runs_manager" ON "agent_runs" USING btree ("manager_id");--> statement-breakpoint
CREATE INDEX "audit_command" ON "audit_log" USING btree ("command_id");--> statement-breakpoint
CREATE INDEX "audit_at" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "chat_session" ON "chat_messages" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "items_stream_stage" ON "content_items" USING btree ("stream_id","stage");--> statement-breakpoint
CREATE INDEX "ideas_status" ON "ideas" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "jd_owner_version" ON "job_descriptions" USING btree ("owner_type","owner_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_manager_date" ON "work_plans" USING btree ("manager_id","date");