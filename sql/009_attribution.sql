-- ─────────────────────────────────────────────────────────────────────────────
-- 009_attribution.sql — Persist paid-media attribution on product_events + users
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Context:
--   Before this migration, attribution (fbclid / gclid) was captured in a
--   first-touch cookie (`wuwu_attr_ft`) and used only for outbound Meta CAPI
--   and Google Enhanced Conversions dispatch. Nothing was persisted on events
--   or users, so every "by channel" KPI (CPA-by-channel, LTV-by-channel,
--   paid-vs-organic retention) was structurally impossible to compute.
--
-- What this adds:
--   (1) Denormalized attribution snapshot on every `product_events` row — so
--       any event can be filtered / grouped by channel / utm_* without a join.
--       Snapshot is read from the first-touch cookie at insert time. Falling
--       back to the user_attribution row when the cookie is absent
--       (e.g. Stripe webhook → pro_activated, no inbound user cookie).
--
--   (2) A `user_attribution` table keyed on auth.users.id — the user-level
--       source of truth for first-touch attribution. Written once at
--       signup_completed; mutates only if null columns get a later value.
--       This is what LTV-by-channel and paid-vs-organic retention queries hit.
--
--   Kept separate from `public.profiles` because marketing attribution should
--   not be loaded on every profile fetch, and delete-everything logic already
--   cascades via `on delete cascade` → auth.users.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── product_events: attribution snapshot ────────────────────────────────────

alter table public.product_events
  add column if not exists attribution_channel text,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content text,
  add column if not exists utm_term text,
  add column if not exists gclid text,
  add column if not exists fbclid text,
  add column if not exists landing_path text,
  add column if not exists referrer_host text;

create index if not exists product_events_attribution_channel_idx
  on public.product_events (attribution_channel);

create index if not exists product_events_utm_campaign_idx
  on public.product_events (utm_campaign);

-- ─── user_attribution: user-level first-touch source of truth ────────────────

create table if not exists public.user_attribution (
  user_id uuid primary key references auth.users (id) on delete cascade,

  -- First touch: populated from the cookie at signup_completed. Immutable
  -- thereafter (no last-touch clobbering).
  first_touch_channel text,
  first_touch_utm_source text,
  first_touch_utm_medium text,
  first_touch_utm_campaign text,
  first_touch_utm_content text,
  first_touch_utm_term text,
  first_touch_gclid text,
  first_touch_fbclid text,
  first_touch_landing_path text,
  first_touch_referrer_host text,
  first_touch_captured_at timestamptz,

  -- Signup touch: channel at the moment signup_completed fired. Usually same
  -- as first_touch when the cookie hasn't expired, but decouples for the case
  -- where a user returns after 90 days from a different channel.
  signup_channel text,
  signup_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_attribution_first_touch_channel_idx
  on public.user_attribution (first_touch_channel);

create index if not exists user_attribution_first_touch_utm_campaign_idx
  on public.user_attribution (first_touch_utm_campaign);

create index if not exists user_attribution_signup_channel_idx
  on public.user_attribution (signup_channel);

drop trigger if exists user_attribution_set_updated_at on public.user_attribution;
create trigger user_attribution_set_updated_at
  before update on public.user_attribution
  for each row execute function public.set_updated_at();

alter table public.user_attribution enable row level security;
