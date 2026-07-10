# Amplifi Capacity Checker

A frictionless daily **Telegram** capacity check-in for the Amplifi team, with an
automatic morning summary to leadership (Michele) and all data stored in
**Supabase** for a dashboard. Deploys on **Vercel**.

## What it does

Every **weekday at 8:00am (UTC+8)** each enrolled member gets a short Telegram
message. A full check-in is **three quick replies**:

1. **Load today, 1–10** — one tap on an inline button (**1 = wide open, 10 = drowning** —
   higher means busier/more loaded)
2. **Why** — one line on what's driving that number
3. **Clients & tasks** — who they're working with and the load (reply **`same`** to
   carry yesterday's roster forward, so stable days stay one-word)

At **10:00am (UTC+8)** Michele (`MICHELE_CHAT_ID`) gets a summary: team average,
each person's load + reason sorted **most-loaded first**, client counts, anyone at or
above the strain zone (≥8/10) flagged for support, and who hasn't responded yet. The
summary sends at the cutoff whether or not everyone has replied, so it never hangs.

Weekends are skipped automatically.

## Architecture

| Piece | Where |
|------|-------|
| Bot replies (buttons, text, `/commands`) | `POST /api/telegram/webhook` |
| 8am check-in blast | `GET /api/cron/checkin` — Vercel Cron `0 0 * * *` (UTC) |
| 10am summary to Michele | `GET /api/cron/summary` — Vercel Cron `0 2 * * *` (UTC) |
| One-time webhook registration | `POST /api/telegram/setup` |
| Read-only dashboard | `/` |
| Data | Supabase (`capchecker_*` tables) |

> The weekly client-roster refresh is folded into the daily flow (question 3),
> so we stay within Vercel Hobby's 2-cron limit.

## Data model (`supabase/migration.sql`)

- **`capchecker_members`** — one row per enrolled member (+ conversation state)
- **`capchecker_checkins`** — the time-series: capacity, reason, client_count per member per day
- **`capchecker_clients`** — living client roster + historical snapshots
- **`capchecker_summaries`** — audit of each daily summary sent
- **`capchecker_daily_view`** — flattened view for charts/BI tools

---

## Setup

### 1. Create the Telegram bot
1. In Telegram, message **@BotFather** → `/newbot` → follow prompts.
2. Copy the **bot token** it gives you.
3. (Optional) `/setcommands` on BotFather and paste:
   ```
   capacity - Do today's capacity check-in
   clients - Update your client roster
   help - How this works
   ```

### 2. Run the database migration
In your Supabase project: **SQL Editor → New query**, paste the contents of
`supabase/migration.sql`, and **Run**. (Idempotent — safe to re-run.)

Grab your **Project URL** and **service_role key** from
**Project Settings → API**.

### 3. Deploy to Vercel
Import this repo into Vercel, then set these environment variables
(Project → Settings → Environment Variables). See `.env.example`.

| Variable | Value |
|---|---|
| `TELEGRAM_BOT_TOKEN` | from BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | `openssl rand -hex 32` |
| `MICHELE_CHAT_ID` | `247646511` |
| `SUPABASE_URL` | your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | your Supabase service_role key |
| `CRON_SECRET` | `openssl rand -hex 32` |
| `SETUP_SECRET` | `openssl rand -hex 32` |
| `PUBLIC_BASE_URL` | your deployment URL, e.g. `https://amplifi-capchecker.vercel.app` |
| `TZ_OFFSET_MINUTES` | `480` (UTC+8) |

Deploy. Vercel picks up the two cron jobs from `vercel.json` automatically.

### 4. Register the Telegram webhook (one time)
```bash
curl -X POST "https://<your-app>.vercel.app/api/telegram/setup?secret=<SETUP_SECRET>"
```
Expect `{"ok":true,"webhook":"…/api/telegram/webhook"}`.

### 5. Enroll the team
Everyone who should be checked in — **including Michele** — opens the bot and
sends **`/start`** once. (Telegram won't let a bot message someone who hasn't
started it first.) Each `/start` creates their `capchecker_members` row and they'll
be in the next morning's blast.

### 6. Verify
- `GET /api/health` → `{"ok":true}`
- Trigger a check-in manually (bypasses the schedule):
  ```bash
  curl "https://<your-app>.vercel.app/api/cron/checkin?secret=<CRON_SECRET>"
  ```
- Trigger the summary manually:
  ```bash
  curl "https://<your-app>.vercel.app/api/cron/summary?secret=<CRON_SECRET>"
  ```
- Or just send `/capacity` to the bot.

---

## Changing the schedule or timezone

- **Times:** edit `vercel.json`. Crons run in **UTC**. `0 0 * * *` = 08:00 UTC+8,
  `0 2 * * *` = 10:00 UTC+8. Adjust and redeploy.
- **Timezone:** the "working day" and weekend skipping use `TZ_OFFSET_MINUTES`
  (minutes east of UTC). Change the env var if the team relocates. If the UTC
  offset changes, update the cron hours in `vercel.json` too.

## Local development

```bash
cp .env.example .env.local   # fill in values
npm install
npm run dev
```

`npm run typecheck` and `npm run build` both run clean.

## Bot commands

| Command | Effect |
|---|---|
| `/start` | Enroll / re-activate |
| `/capacity` | Run today's check-in on demand |
| `/clients` | Update client roster any time |
| `/pause` | Stop your own daily check-ins (leave, etc.) — `/start` resumes |
| `/team` | **Admins only** (Michele + `ADMIN_CHAT_IDS`): roster with tap-to-pause/resume buttons |
| `/help` | How it works |

## Operational notes

- **Summary is idempotent:** at most one summary per day. Re-running the
  endpoint returns `skipped: already_sent`. Force a re-send with
  `&force=1` on the manual trigger URL.
- **Vercel Hobby cron timing:** Hobby-plan crons fire *within the hour* of
  their schedule, so the "10am" summary can arrive between 10:00–10:59am
  (UTC+8). Vercel Pro gives to-the-minute scheduling if that matters.
- **Dashboard privacy:** set `DASHBOARD_PASSWORD` and share
  `https://<app>/?key=<password>` with people who should see it.

## Notes & next steps

- **Response rate is the metric that matters.** Three questions daily is more
  than the two I'd have picked, so the `same` shortcut on question 3 is what
  keeps it light — watch adoption and drop question 3 to weekly if replies dip.
- The `/` dashboard is intentionally minimal (a table + today's average). The
  data model (`capchecker_daily_view`) is built for a richer analytics dashboard
  next: capacity trend lines per member, client-load vs capacity correlation, etc.
