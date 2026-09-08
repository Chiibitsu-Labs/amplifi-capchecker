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

---

## Database backups

Supabase's Free plan gives you no backup you can actually reach. capchecker holds
a client's data, grows every day, and until now had no recovery path from a bad
migration, a wrong `delete`, or a bug.

`.github/workflows/db-backup.yml` runs a nightly `pg_dump` of the **whole
database**, asserts the dump is not empty, encrypts it, and stores it as a
90-day GitHub Actions artifact. It runs **outside Supabase**, so it keeps working
if the project is ever paused — and because a dump is database activity, the same
job doubles as the keep-alive that stops a Free-plan project pausing in the first
place. (On capchecker the keep-alive half is redundant; real traffic already does
it. It stays because this workflow is meant to be copied to quieter projects.)

**Schedule:** 18:30 UTC = 02:30 UTC+8, nightly. Deliberately clear of the app's
own Vercel crons at 00:00 and 02:00 UTC. Run it by hand any time from
**Actions → Nightly database backup → Run workflow**.

### What it backs up

capchecker's tables do not live in a project of their own — they sit in the
shared **`chiibitsu-labs`** Supabase project alongside several other apps. The
dump therefore covers that whole database, `capchecker_*` included. That is the
right call (a whole-database dump does not rot as schemas change, and one job
now protects several projects), but it has a consequence worth stating plainly:

> **Amplifi's data and Chiibitsu Labs' other data are already in one database.**
> No choice of backup destination separates them. Real client separation would
> need a schema or project split upstream — it is not something the backup job
> can deliver.

The dump also contains **`google_tokens`** — live OAuth credentials, not just
personal information. That is why encryption here is not optional.

Unlike a booking-style app whose records live in Google Calendar, capchecker's
system of record genuinely *is* Postgres: check-ins, reasons, client rosters,
summaries and conversation state are all rows. Telegram is only transport. A dump
of this database really does contain the thing you would want restored.

### Secrets to create

**Settings → Secrets and variables → Actions → New repository secret**, on this
repo. All four are required; the workflow refuses to store an unencrypted dump.

| Secret | Value |
|---|---|
| `SUPABASE_DB_URL` | Supabase → Project Settings → Database → Connection string → **Session pooler** (port 5432). See the warning below. |
| `AGE_PUBLIC_KEY` | The `age1...` public key from the keypair you generate below. |
| `TELEGRAM_BOT_TOKEN` | The same bot token the app already uses. |
| `TELEGRAM_ALERT_CHAT_ID` | **Your** Telegram user id, not Michele's — these alerts are operational, not for the client. |

> **Use the Session pooler string, not the direct connection.** GitHub Actions
> runners are IPv4-only, and a Supabase project's direct `db.<ref>.supabase.co`
> host is IPv6-only unless the paid IPv4 add-on is enabled. Do **not** use the
> transaction pooler (port 6543) — it does not support what `pg_dump` needs. If
> the connection fails, the workflow prints this same guidance in the log.

`AGE_PUBLIC_KEY` is a public key, so it is not really a secret; it lives in
Secrets only so that setup is one screen instead of two.

### Generate the encryption keypair

Run this **on your own machine**, once:

```bash
age-keygen -o capchecker-backup-key.txt
```

It prints the public key (`age1...`) — that is what goes into `AGE_PUBLIC_KEY`.
The file it writes contains the **private** key.

- Put the private key in your password manager. Losing it makes every dump
  unreadable; there is no recovery.
- Never commit it, never put it in GitHub Secrets, never paste it into a chat.
  The workflow only ever needs the public half, which is the whole point — the
  job can create backups it cannot itself read.

### Restoring

Restore into a **fresh, empty database** — never straight over a live one. The
dump has no `DROP` statements precisely so a mistyped target cannot destroy
anything, but that only protects you if the target is empty.

```bash
# 1. Download the dump you want (needs the GitHub CLI).
gh run list --workflow db-backup.yml --limit 10
gh run download <run-id> --dir ./restore

# 2. Decrypt, decompress, and restore in one pipe.
age --decrypt --identity capchecker-backup-key.txt \
      ./restore/capchecker-<timestamp>.sql.gz.age \
  | gunzip \
  | psql "<connection string of a FRESH database>" -v ON_ERROR_STOP=1

# 3. Confirm the rows are actually there.
psql "<fresh database>" -c "select count(*) from capchecker_checkins;"
```

To recover a single mistake rather than everything, restore into a scratch
database first, then copy back only the rows you need.

**This has been run.** See *What was and was not tested* below for exactly what
that covers — and what it does not.

### Retention, and who deletes old dumps

**GitHub deletes them, automatically, 90 days after each run.** That is the
whole retention policy, and it is why dumps are stored as Actions artifacts
rather than committed to a private backup repo.

The reasoning is the obligation, not convenience. These dumps hold client
personal information (RA 10173) and live OAuth tokens, so a retention period has
to be one that is actually enforced. **Git cannot delete a file** — pruning old
dumps from a repo means rewriting history, which is a manual chore nobody does,
so "retention" there quietly becomes "forever." Artifact expiry is enforced by
the platform and needs no discipline. It also avoids standing up a second store
of client data with its own access list and handover duties.

Change the window by editing `RETENTION_DAYS` in the workflow.

**What the private-repo option would need**, if you ever want longer history: a
private repo *per project* (never one shared repo — one client's data must not
sit in another's), a documented pruning job that force-pushes, a reviewed access
list, and naming it in the client's data inventory. Worth it only if you need
recovery points older than 90 days.

### Known limits

- **Neither option survives losing the GitHub account.** Actions artifacts and a
  private GitHub repo both die with the account. Only off-platform storage
  (Cloudflare R2, Backblaze B2) fixes that. If that matters, download one dump a
  month and keep it somewhere else — or move the destination to R2, which is the
  natural upgrade and changes only the upload step.
- **90 days is the oldest recoverable state.** Corruption that goes unnoticed
  for longer is not recoverable from here.
- **GitHub disables scheduled workflows in repositories with no activity for
  ~60 days.** This is exactly the silent-failure mode the job is built to avoid,
  and the job's own runs do not count as repository activity. *(Documented
  GitHub behaviour; not re-verified in this session — check before relying on
  the number.)* A quarterly reminder to open the Actions tab and confirm the
  last green run costs nothing and closes the gap.
- **Failure is loud, success is silent** — by design. A nightly "backup OK"
  message trains you to ignore it. Failure sends Telegram; nothing else does.

### Copying this to another Supabase project

The workflow is built to be copied by changing config, not by rewriting it.

1. Copy `.github/workflows/db-backup.yml` and `.github/scripts/verify_dump.py`
   into the other repo.
2. Edit the three marked lines in `env:`:
   - `PROJECT_SLUG` — names the artifact.
   - `PG_MAJOR` — **must match that project's Postgres major version**
     (Supabase → Project Settings → Infrastructure). `pg_dump` refuses to dump a
     server newer than itself, so this is not cosmetic.
   - `CRITICAL_TABLES` — the tables whose emptiness should fail the job, as
     `schema.table[:min_rows]`.
3. Create the same four secrets in that repo.
4. Run it once by hand and confirm it goes green.

Before adopting it for a project, apply the standard's own test: **write down
where each kind of record actually lives.** A job can run nightly, succeed, and
back up nothing anyone wanted — an app whose real records are Google Calendar
events or Airtable rows needs those exported too, or a `pg_dump` of it is a
perfectly healthy backup of the wrong thing. `CRITICAL_TABLES` enforces the
part of that which Postgres can see; the rest is a judgement you make first.

### What was and was not tested

Verified by running it, on 2026-09-08:

- The full pipeline — `pg_dump` → non-empty assertion → `gzip` → `age` encrypt →
  `age` decrypt → `psql` restore into a fresh database — against a local
  PostgreSQL loaded from this repo's own `supabase/migration.sql`.
- Restore fidelity: all five `capchecker_*` tables matched the source row for
  row, and the view, triggers, RLS flags and check constraints all came back.
  Unicode names, embedded apostrophes, `jsonb` payloads and `NULL`s survived.
- The assertion actually fails when it should: schema-only dump, dump of an
  empty database, truncated dump, renamed-away table, and an unmet row minimum
  were each caught.
- The workflow's YAML parses and every shell step passes `bash -n`.

**Not tested, and worth knowing:**

- **Nothing has run against the live Supabase project.** The connection string
  is a secret this session never had, so the real `SUPABASE_DB_URL`, the Session
  pooler path, the Telegram alert, and artifact upload are all unexercised. The
  first scheduled run is the real test — watch it.
- The local drill used **PostgreSQL 16**; the Supabase project is **17.6.1**.
  `apt.postgresql.org` was unreachable from the build sandbox, so the PGDG
  install step that fetches the 17 client is itself untested.
- Whether the `postgres` role can read every schema not in `EXCLUDE_SCHEMAS`
  (notably `auth` and `storage`) is unverified. If a run fails with
  "permission denied for schema X", add X to `EXCLUDE_SCHEMAS` — do not switch
  to dumping selected tables.

### On not paying for Supabase Pro

Verified against Supabase's documentation:

- Free-plan projects are paused after **low activity over a 7-day period**;
  "a few user requests to the database each day over the previous week" prevents
  it, and two warning emails go out first.
- A paused project can be restored for **90 days**, after which it cannot.
- Paid-plan projects are never paused for inactivity.
- On Free-plan backups, Supabase's own wording is *"We are currently taking up to
  7 daily backups that will be available for you once you upgrade… we might no
  longer make daily backups for free projects in the future."* So the accurate
  claim is **no self-serve backup and no guarantee** — not "no backup is taken."

**Not verified:** Pro's $25/month price, its 7-day backup retention, and whether
point-in-time recovery is a separate add-on. supabase.com was unreachable from
the session that wrote this. Check current pricing before quoting any of it.

What is verifiable without those numbers is the shape of the trade: this job's
retention is a value you control, the dumps live somewhere Chiibitsu Labs holds,
and it costs nothing per project. Pro buys point-in-time recovery and no pausing
— worth deciding on their own merits, not as a backup strategy.

---

## Notes & next steps

- **Response rate is the metric that matters.** Three questions daily is more
  than the two I'd have picked, so the `same` shortcut on question 3 is what
  keeps it light — watch adoption and drop question 3 to weekly if replies dip.
- The `/` dashboard is intentionally minimal (a table + today's average). The
  data model (`capchecker_daily_view`) is built for a richer analytics dashboard
  next: capacity trend lines per member, client-load vs capacity correlation, etc.
