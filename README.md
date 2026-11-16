# Ornate Marketing OS

A private portal where AI managers and agents plan, create, review and track marketing content for **Ornate Solar** and **UnityESS**. Head (Fateh) → AI managers (one per stream) → AI agents. Agents draft, managers review and rank, a human approves. Nothing publishes without an approval on record.

## Stack

- Next.js 15 (App Router, server components and server actions)
- Drizzle ORM on Postgres: **PGlite** locally (stored in `./.data/pglite`, created automatically) and **Neon** in production (`DATABASE_URL`)
- Auth.js with Google sign-in, limited to `ALLOWED_DOMAIN` (ornatesolar.com)
- Groq through a single `llm()` helper (`src/lib/llm.ts`). The provider and model for each purpose (chat, planning, research, writing) live in the `llm_settings` table, so you change them on the Settings page or by chat, with no deploy. Every call is logged in `llm_calls` with its tokens.
- GitHub Actions calls `/api/cron/tick` every 30 minutes with `CRON_SECRET` to wake the agents:
  - managers build their plans from 7 am IST
  - researchers top up Ideas through the day
  - reports are written at 7 pm IST

## Run locally

```bash
npm install
cp .env.example .env.local   # set AUTH_SECRET, GROQ_API_KEY; AUTH_DEV_LOGIN=true for a local sign-in box
npm run dev
```

On first start the app creates the database, runs the migrations and seeds it with:
- the 2 brands
- 13 streams, each with its manager and starter agents
- version 1 of every job description
- the default AI models
- 6 channels
- the 3 brand facts stated in the brief

## Deploy (Vercel + Neon)

1. Create a Neon database and set `DATABASE_URL`.
2. Set the Vercel build command to `npm run db:migrate && next build`.
3. Set these environment variables:
   - `AUTH_SECRET`
   - `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` (Google OAuth client; redirect URI `https://<host>/api/auth/callback/google`)
   - `ALLOWED_DOMAIN`, `HEAD_EMAILS`
   - `GROQ_API_KEY`
   - `CRON_SECRET`
   - optional: `INSTINCT_WEBHOOK_URL`, `RESEND_API_KEY`, `REPORT_EMAIL_TO`, `REPORT_EMAIL_FROM`
4. In GitHub, add the secrets `APP_URL` and `CRON_SECRET`. The workflow in `.github/workflows/cron.yml` does the rest.

`AUTH_DEV_LOGIN` is ignored in production.

## How it fits together

| Where | What |
|---|---|
| `src/db/schema.ts` | Data model: brands, streams, managers, agents, versioned job descriptions, focuses, work plans and plan items, agent runs, daily reports, ideas, content items and versions, assets, brand facts, approvals, people and consents, renders, channels, publications, metrics, AI settings and calls, chat messages and commands, audit log |
| `src/lib/ops.ts` | Every change the portal can make. Buttons, the chat and cron all call these. |
| `src/lib/audit.ts` | `insertAudited` / `updateAudited` write who, what, before and after; `undoCommand` reverses one chat command |
| `src/lib/research.ts` | Ideas research: Google News RSS → AI → de-duplication against every earlier idea (including rejected ones) → best ones added; reject reasons are fed back into the prompt |
| `src/lib/planning.ts` | Morning plans (focus first, then yesterday's report and feedback, backlog and quotas), end-of-day manager reports, the Head summary sent to the Instinct webhook and email, and `tick()` |
| `src/lib/chat/` | Command chat: tool definitions plus the AI ↔ tools loop. Every change gets an Undo button. Publishing and retiring wait for a Confirm click. |
| `src/app/api/cron/[job]` | `tick`, `plans`, `research`, `reports` (Bearer `CRON_SECRET`) |

Without a working AI key, every agent falls back to a simple non-AI mode: headline-only ideas, backlog-order plans and template reports. The chat says it is offline. One-tap buttons keep working either way.

## Phases

1. **Done:**
   - skeleton and sign-in
   - managers, agents and versioned job descriptions
   - status, quota and focus controls
   - the command chat (with Undo, Confirm and voice input)
   - the Ideas window
   - plans, reports and cron
   - Brand facts
   - the audit log
2. LinkedIn, Instagram and blog drafting, with manager review and approvals
3. Emailers, brochures, case studies, white papers and PR
4. Video Studio: avatar renders gated by consent, Indian-language versions, a daily budget cap
5. Publishing connectors and metrics
