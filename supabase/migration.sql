-- ════════════════════════════════════════════════════════════════════════
-- Amplifi Capacity Checker — schema
-- Run this once in the Supabase SQL Editor (Dashboard → SQL → New query).
-- All tables are prefixed `capchecker_` so they won't collide with anything
-- else in the project. Safe to re-run (IF NOT EXISTS / idempotent).
-- ════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── Members ─────────────────────────────────────────────────────────────
-- One row per enrolled team member. Created automatically on /start.
create table if not exists capchecker_members (
  id               uuid primary key default gen_random_uuid(),
  telegram_user_id bigint unique not null,
  name             text not null,
  username         text,
  is_active        boolean not null default true,
  -- Lightweight per-user conversation state for the reply flow.
  state            text not null default 'idle',
  state_context    jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ── Daily check-ins ─────────────────────────────────────────────────────
-- The core time-series: one capacity reading per member per working day.
create table if not exists capchecker_checkins (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references capchecker_members(id) on delete cascade,
  check_date   date not null,
  capacity     smallint check (capacity between 1 and 10),
  reason       text,
  client_count smallint,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (member_id, check_date)
);

create index if not exists capchecker_checkins_date_idx
  on capchecker_checkins (check_date);
create index if not exists capchecker_checkins_member_idx
  on capchecker_checkins (member_id);

-- ── Client roster snapshots ─────────────────────────────────────────────
-- The living roster (is_current = true) plus history of past snapshots so the
-- dashboard can show client churn over time.
create table if not exists capchecker_clients (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references capchecker_members(id) on delete cascade,
  client_name   text not null,
  task_context  text,
  snapshot_date date,
  is_current    boolean not null default true,
  created_at    timestamptz not null default now()
);

create index if not exists capchecker_clients_current_idx
  on capchecker_clients (member_id, is_current);

-- ── Summary audit ───────────────────────────────────────────────────────
-- What we sent Michele each day (handy for debugging + backfilling a dashboard).
create table if not exists capchecker_summaries (
  id           uuid primary key default gen_random_uuid(),
  summary_date date unique not null,
  payload      jsonb,
  sent_at      timestamptz,
  created_at   timestamptz not null default now()
);

-- ── updated_at maintenance ──────────────────────────────────────────────
create or replace function capchecker_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists capchecker_members_touch on capchecker_members;
create trigger capchecker_members_touch
  before update on capchecker_members
  for each row execute function capchecker_touch_updated_at();

drop trigger if exists capchecker_checkins_touch on capchecker_checkins;
create trigger capchecker_checkins_touch
  before update on capchecker_checkins
  for each row execute function capchecker_touch_updated_at();

-- ── Row Level Security ──────────────────────────────────────────────────
-- The app connects only with the service-role key, which bypasses RLS.
-- Enabling RLS with no policies locks the tables to everyone else (anon/auth),
-- so the data can't leak via the public API.
alter table capchecker_members    enable row level security;
alter table capchecker_checkins   enable row level security;
alter table capchecker_clients    enable row level security;
alter table capchecker_summaries  enable row level security;

-- ── Dashboard convenience view ──────────────────────────────────────────
-- Flattened daily rows with member name — point a chart / BI tool at this.
create or replace view capchecker_daily_view as
select
  c.check_date,
  m.name           as member_name,
  m.telegram_user_id,
  c.capacity,
  c.reason,
  c.client_count,
  c.created_at
from capchecker_checkins c
join capchecker_members m on m.id = c.member_id;
