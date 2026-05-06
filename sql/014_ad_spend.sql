-- 014_ad_spend.sql
-- Daily ad spend by channel. Ingested from Meta Ads API and Google Ads API
-- (or mock data until real credentials are configured).
--
-- One row per channel per day. Joins with user_attribution.channel to
-- compute CPA-by-channel, ROAS, and contribute to gross margin.
--
-- Roadmap reference: 2.7

create table if not exists public.ad_spend (
  id             uuid        primary key default gen_random_uuid(),
  created_at     timestamptz not null    default now(),

  -- Which ad platform and account
  channel        text        not null,   -- 'meta' | 'google' | (future channels)
  account_id     text,                    -- Platform-specific account ID (nullable for mock rows)
  campaign_name  text,                    -- Optional campaign-level granularity

  -- Daily spend
  spend_date     date        not null,   -- The date this spend covers (UTC calendar day)
  spend_usd     numeric(12, 2) not null, -- USD amount spent on that date

  -- Impressions and clicks (available from both platforms, useful for CPC / CPM)
  impressions    integer,
  clicks         integer,

  -- Data provenance
  source         text        not null default 'mock',
  -- 'mock' | 'meta_api' | 'google_api' | 'manual'
  fetched_at     timestamptz not null    default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes — optimised for ops dashboard queries
-- ─────────────────────────────────────────────────────────────────────────────

create index if not exists ad_spend_channel_date_idx
  on public.ad_spend (channel, spend_date desc);

create index if not exists ad_spend_spend_date_idx
  on public.ad_spend (spend_date desc);

-- Unique constraint: one spend row per channel per date per account.
-- Prevents duplicate ingestion on re-runs.
create unique index if not exists ad_spend_channel_date_account_uniq
  on public.ad_spend (channel, spend_date, account_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Row-Level Security
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.ad_spend enable row level security;

-- Service role can insert and read everything (ingestion + dashboard).
create policy "service role full access"
  on public.ad_spend
  for all
  to service_role
  using (true)
  with check (true);

-- No authenticated-user read access — this is operator-only data.