-- 5.3 Decision log + outcome follow-up.
--
-- One row per guidance per user. The user can optionally log what they
-- decided and pick a revisit date; when that date arrives they see a
-- "how did it go?" prompt on the Ask page.
--
-- Run with: paste into Supabase SQL editor or apply via supabase db push.

create table if not exists public.decision_logs (
  id                   uuid        primary key default gen_random_uuid(),
  user_id              uuid        not null references auth.users on delete cascade,
  decision_guidance_id uuid        not null references public.decision_guidance(id) on delete cascade,

  -- What the user committed to (required, max ~500 chars enforced by app layer).
  committed_action     text        not null,

  -- When to check back. Stored as a date (not timestamptz) so the
  -- comparison "revisit_at <= current_date in user's timezone" stays simple.
  revisit_at           date        not null,

  -- Outcome — filled in when the user answers the follow-up.
  outcome              text        check (outcome in ('went_well', 'mixed', 'went_poorly')),
  outcome_note         text,
  outcome_submitted_at timestamptz,

  created_at           timestamptz not null default now(),

  -- One log entry per guidance. Upsert pattern: if user re-submits the log
  -- form we update in place rather than create duplicates.
  constraint decision_logs_guidance_user_unique unique (decision_guidance_id, user_id)
);

-- Fast lookup: overdue follow-ups for a user (used on every Ask page load).
create index if not exists decision_logs_user_overdue_idx
  on public.decision_logs (user_id, revisit_at)
  where outcome is null;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.decision_logs enable row level security;

create policy "decision_logs_owner_all" on public.decision_logs
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
