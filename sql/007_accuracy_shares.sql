-- 5.2 Phase D — per-user shareable accuracy link.
--
-- One row per user. Upserted on demand — the share token never changes once
-- created, so a link shared on social stays valid forever. If the user deletes
-- their account the row cascades away via the auth.users FK.
--
-- The public SELECT policy lets unauthenticated visitors resolve a token → user_id
-- so the public share page and OG image route can load the accuracy report
-- (via the admin/service-role client which bypasses briefing_feedback RLS).
-- No PII is stored on this table — it is a mapping from token → user_id only.
--
-- Run with: paste into Supabase SQL editor or apply via supabase db push.

create table if not exists public.accuracy_shares (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users on delete cascade,
  share_token  text        not null unique,
  created_at   timestamptz not null default now(),

  -- One share record per user. ON CONFLICT on user_id is used in the upsert
  -- so the token is stable across multiple "get my share link" requests.
  constraint accuracy_shares_user_unique unique (user_id)
);

-- Index for the token-lookup hot path (public share page + OG image).
create index if not exists accuracy_shares_token_idx
  on public.accuracy_shares (share_token);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.accuracy_shares enable row level security;

-- Public: anyone can read a row by its share_token (needed for the public
-- share page and the /opengraph-image route, both of which are unauthenticated).
-- The token acts as a capability — it exposes only user_id, which is opaque.
create policy "accuracy_shares_public_read" on public.accuracy_shares
  for select
  using (true);

-- Authenticated owner: may insert or update their own row.
create policy "accuracy_shares_owner_write" on public.accuracy_shares
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
