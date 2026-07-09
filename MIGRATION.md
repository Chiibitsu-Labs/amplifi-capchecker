# Migration runbook: demo infra → Michele's accounts

**Model:** Chii keeps developing (repo stays in `Chiibitsu-Labs`); Michele owns
the data and runtime (her Supabase, her Vercel, her bot — the bot is already
hers). Execute after the v1 trial, once everyone's happy.

**What moves:** Supabase (data) and Vercel (app + secrets).
**What doesn't:** the GitHub repo, the Telegram bot, the team's enrollment
(nobody re-`/start`s — the webhook re-point is invisible to them).

---

## Phase 0 — prep (Chii, ~10 min, any time before cutover)

1. Ask Michele for her GitHub username (she needs a free account). Add her as
   a **read** collaborator on `Chiibitsu-Labs/amplifi-capchecker`
   (repo → Settings → Collaborators). This lets her Vercel import the repo.
2. Confirm Michele has the bot token handy (she created the bot in @BotFather;
   `/mybots` → her bot → API Token shows it again).

## Phase 1 — Michele's Supabase (~10 min, her clicks)

1. Create a project at [supabase.com](https://supabase.com) (any name, e.g.
   `amplifi-capchecker`; pick a nearby region, e.g. Singapore).
2. In the project: **SQL Editor → New query** → paste the full contents of
   [`supabase/migration.sql`](supabase/migration.sql) → **Run**. (Idempotent;
   safe to re-run. RLS comes on automatically — the data is locked to
   everyone except the service key.)
3. Collect two values from **Project Settings → API**:
   - **Project URL** (`https://xxxx.supabase.co`)
   - **`service_role` secret key** — the one marked *secret*, NOT `anon`.
     ⚠️ This mix-up caused our one setup bug in the demo; triple-check.

## Phase 2 — Michele's Vercel (~15 min, her clicks)

1. Create an account at [vercel.com](https://vercel.com) (Hobby is fine),
   signing in **with her GitHub account**.
2. **Add New… → Project → Import** `Chiibitsu-Labs/amplifi-capchecker`.
   - If it doesn't appear: she needs to install the Vercel GitHub App and
     grant it access; if the org repo still won't list (cross-org quirk),
     fallback = Chii transfers the repo to her account or she forks it —
     decide then, don't pre-solve.
3. Before the first deploy finishes, set **Environment Variables**
   (Settings → Environment Variables). Fresh values — do NOT reuse the demo
   secrets:

   | Variable | Value |
   |---|---|
   | `TELEGRAM_BOT_TOKEN` | her bot's token from @BotFather |
   | `TELEGRAM_WEBHOOK_SECRET` | new random: `openssl rand -hex 32` |
   | `MICHELE_CHAT_ID` | `247646511` |
   | `ADMIN_CHAT_IDS` | Chii's Telegram id (so Chii can still `/team`), optional |
   | `SUPABASE_URL` | from Phase 1 |
   | `SUPABASE_SERVICE_ROLE_KEY` | from Phase 1 |
   | `CRON_SECRET` | new random |
   | `SETUP_SECRET` | new random |
   | `PUBLIC_BASE_URL` | her production URL, e.g. `https://amplifi-capchecker-xyz.vercel.app` (visible after first deploy — set it then redeploy) |
   | `TZ_OFFSET_MINUTES` | `480` |
   | `DASHBOARD_PASSWORD` | anything she likes; dashboard link becomes `…/?key=<it>` |

4. Deploy (Vercel registers the two crons from `vercel.json` automatically).
5. Smoke test: `https://<her-app>/api/health` → `{"ok":true}`.

## Phase 3 — data copy (Chii, ~5 min)

Copy the trial data so history/trends carry over. Generate INSERTs from the
demo database (Claude can produce this script at migration time), or accept a
clean slate if Michele prefers starting fresh. Tables to copy, in order:
`capchecker_members` → `capchecker_checkins` → `capchecker_clients` →
`capchecker_summaries`.

## Phase 4 — cutover (~2 min, do it between 10:05am and next 7:55am UTC+8)

The webhook re-point is the atomic switch — the bot serves exactly one URL:

```bash
curl -X POST "https://<her-app>.vercel.app/api/telegram/setup?secret=<her SETUP_SECRET>"
```

Expect `{"ok":true,"webhook":"https://<her-app>…/api/telegram/webhook"}`.
From this second, all taps/replies land in her deployment. Team does nothing.

## Phase 5 — decommission the demo (Chii, same day — IMPORTANT)

The 8am blast is *push*, not webhook: if the old deployment stays alive, the
team gets **double check-ins** (both apps message via the same bot).

1. Delete the `amplifi-capchecker` project from Chii's Vercel
   (Settings → Advanced → Delete Project). This kills the old crons.
2. Drop the demo tables from Chii's `chiibitsu-labs` Supabase:
   ```sql
   drop view if exists capchecker_daily_view;
   drop table if exists capchecker_summaries, capchecker_clients,
     capchecker_checkins, capchecker_members cascade;
   drop function if exists capchecker_touch_updated_at();
   ```
3. Michele rotates the bot token if she wants certainty the demo infra can't
   message the team (@BotFather → `/mybots` → Revoke), then updates
   `TELEGRAM_BOT_TOKEN` in her Vercel and redeploys. Optional but tidy.

## Phase 6 — "prompt Claude" for Michele (~5 min, her clicks)

For free-form questions ("weekly summary", "who's been red the most this
month?"), Michele connects **Supabase only** to Claude — Vercel is not needed
for data questions:

1. In [claude.ai](https://claude.ai) → **Settings → Connectors** → add
   **Supabase** → authorize her Supabase account → select the capchecker
   project.
2. Ask away: *"Summarize my team's capacity for last week from the
   capchecker tables"* — the `capchecker_daily_view` is built for exactly
   this.

> In-bot `/summary week` / `/summary month` commands (no Claude needed) are
> the first planned post-v1 enhancement — see README notes.

## Ongoing (agency model)

- Chii ships changes to this repo → Michele's Vercel auto-deploys `main`.
- Secrets live only in Michele's Vercel; Chii never needs them.
- If Chii should stop being able to trigger deploys, Michele removes the
  repo connection or Chii's collaborator access — everything keeps running.
