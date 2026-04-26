-- 005_cost_events.sql
-- Unit-economics telemetry.  One row per LLM call or external-API call.
-- Fire-and-forget from server-side route handlers; never blocks responses.
--
-- Granularity: one row per generation pass (signals, narrative, safety_judge,
-- stream, extract, embed, freeastroapi).  Aggregate with cost_events_daily_summary.
--
-- Roadmap reference: 2.2

create table if not exists public.cost_events (
  id               uuid        primary key default gen_random_uuid(),
  created_at       timestamptz not null    default now(),

  -- What generated this event
  -- feature values: 'today' | 'blueprint' | 'forecast' | 'decision_guidance' |
  --                 'ask_follow_up' | 'memory_extract' | 'memory_embed' | 'freeastroapi'
  feature          text        not null,
  -- pass_label values: 'signals' | 'narrative' | 'blueprint' | 'safety_judge' |
  --   'stream' | 'suggestions' | 'extract' | 'embed' | 'bazi' | 'chinese_today' |
  --   'panchang' | 'western' | 'timing' | 'synthesis' | 'guidance'
  pass_label       text,

  -- Provider + model
  -- provider values: 'anthropic' | 'openai' | 'freeastroapi'
  provider         text        not null,
  model            text        not null,   -- e.g. 'claude-haiku-4-5-20251001', 'text-embedding-3-small', 'freeastroapi'

  -- Token counts (null for non-LLM calls such as FreeAstroAPI)
  input_tokens     integer,
  output_tokens    integer,

  -- Cost (null when pricing not known, e.g. subscription-based FreeAstroAPI)
  cost_usd         numeric(12, 8),
  cost_is_estimated boolean     not null   default true,

  -- Latency
  duration_ms      integer     not null,

  -- Request context
  user_id          uuid        references auth.users(id) on delete set null,
  tier             text,                   -- 'free' | 'pro' | null
  succeeded        boolean     not null,
  request_id       text                    -- correlation with product_events.request_id
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes — optimised for ops dashboard queries and per-user cost audits
-- ─────────────────────────────────────────────────────────────────────────────

create index if not exists cost_events_created_at_idx
  on public.cost_events (created_at desc);

create index if not exists cost_events_feature_idx
  on public.cost_events (feature, created_at desc);

create index if not exists cost_events_user_id_idx
  on public.cost_events (user_id, created_at desc)
  where user_id is not null;

create index if not exists cost_events_request_id_idx
  on public.cost_events (request_id)
  where request_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- Row-Level Security
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.cost_events enable row level security;

-- Service role (server-side logCostEvent) can insert and read everything.
create policy "service role full access"
  on public.cost_events
  for all
  to service_role
  using (true)
  with check (true);

-- Authenticated users can view their own rows (future ops dashboard / user cost panel).
create policy "users read own"
  on public.cost_events
  for select
  to authenticated
  using (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- Aggregation view: cost by feature × provider × model × tier × day
-- Primary surface for ops dashboard (2.3) and pricing decisions.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view public.cost_events_daily_summary as
select
  date_trunc('day', created_at at time zone 'UTC')::date  as day,
  feature,
  provider,
  model,
  tier,
  count(*)                                                  as call_count,
  count(*) filter (where succeeded = true)                  as success_count,
  count(*) filter (where succeeded = false)                 as failure_count,
  round(avg(cost_usd)::numeric, 8)                          as avg_cost_usd,
  round(
    percentile_cont(0.95) within group (order by cost_usd)::numeric,
    8
  )                                                         as p95_cost_usd,
  round(sum(cost_usd)::numeric, 6)                          as total_cost_usd,
  round(avg(duration_ms))                                   as avg_duration_ms,
  round(avg(input_tokens))                                  as avg_input_tokens,
  round(avg(output_tokens))                                 as avg_output_tokens
from public.cost_events
where cost_usd is not null
group by
  date_trunc('day', created_at at time zone 'UTC')::date,
  feature,
  provider,
  model,
  tier
order by day desc, total_cost_usd desc;
