-- ─────────────────────────────────────────────────────────────────────────────
-- 010_usage_counters.sql — Server-side per-user-per-period usage counters
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Context:
--   Free-tier usage limits (3 Ask/day, 3 Today refresh/day) were previously
--   tracked client-side in localStorage only, which any user can clear in
--   dev tools to bypass. This migration adds a counters table that server
--   API routes update before/after LLM dispatch to enforce limits authoritatively.
--
-- Shape:
--   (user_id, period_key, feature) is the primary key. period_key is a string
--   like "2026-05-05" (daily) or "2026-W18" (weekly) computed by the server.
--   The server uses the service-role admin client for INSERT/UPDATE so it can
--   bypass RLS. Users may SELECT their own counters via the user-RLS policy
--   (e.g., to display "2 of 3 used today" in the UI without trusting localStorage).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.usage_counters (
  user_id uuid not null references auth.users(id) on delete cascade,
  period_key text not null,
  feature text not null,
  count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, period_key, feature)
);

alter table public.usage_counters enable row level security;

drop policy if exists "Users can read their own usage counters" on public.usage_counters;
create policy "Users can read their own usage counters"
  on public.usage_counters
  for select
  using (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policies for end users: only the service role writes,
-- which bypasses RLS. This prevents a user from forging a row that says they've
-- used 0 of 3 when they've actually used 3.

create index if not exists usage_counters_user_period_idx
  on public.usage_counters (user_id, period_key);