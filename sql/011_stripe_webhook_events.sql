-- ─────────────────────────────────────────────────────────────────────────────
-- 011_stripe_webhook_events.sql — Stripe webhook event idempotency log
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Context:
--   Stripe retries webhooks on 5xx or timeout. Without idempotency, a retry
--   re-runs grantProAccessToUser, re-logs pro_activated, and may double-fire
--   conversion pixels. This table claims each event.id as a Postgres unique
--   key so the second delivery atomically detects the duplicate and skips.
--
-- Shape:
--   event_id is the primary key (Stripe guarantees uniqueness across the
--   account). event_type is denormalized for ops queries. received_at is a
--   default-now timestamp; an index on it lets us prune old rows or run
--   "events processed today" queries.
--
--   Pruning: not auto-pruned by this migration. A future ops job can delete
--   rows older than (e.g.) 30 days; rows are tiny so this isn't urgent.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  received_at timestamptz not null default now()
);

alter table public.stripe_webhook_events enable row level security;
-- No user policies — only the service-role admin client touches this table.

create index if not exists stripe_webhook_events_received_at_idx
  on public.stripe_webhook_events (received_at);