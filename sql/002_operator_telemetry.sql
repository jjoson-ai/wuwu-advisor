create table if not exists public.product_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null,
  user_id uuid references auth.users (id) on delete set null,
  event_name text not null,
  tier text,
  platform text,
  feature text,
  plan_type text,
  upgrade_surface text,
  request_id text,
  final_model_selected text,
  generation_path text,
  fallback_triggered boolean,
  request_cost_estimate_usd double precision,
  request_cost_is_estimated boolean,
  is_first_use boolean,
  repeat_within_24h boolean,
  created_at timestamptz not null default now()
);

alter table public.product_events
  add column if not exists request_cost_is_estimated boolean;

create table if not exists public.routing_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null,
  request_id text not null,
  feature text not null,
  tier text not null,
  platform text not null,
  final_model_selected text not null,
  path_taken text not null,
  fallback_triggered boolean not null default false,
  fallback_reason text,
  complexity_score double precision,
  conflict_score double precision,
  emotional_intensity double precision,
  decision_ambiguity double precision,
  phase_shift_score double precision,
  synthesis_burden double precision,
  forced_frontier_reasons_json jsonb not null default '[]'::jsonb,
  tone_preference text,
  created_at timestamptz not null default now()
);

create index if not exists product_events_occurred_at_idx
  on public.product_events (occurred_at desc);

create index if not exists product_events_event_name_idx
  on public.product_events (event_name);

create index if not exists product_events_feature_idx
  on public.product_events (feature);

create index if not exists product_events_platform_idx
  on public.product_events (platform);

create index if not exists product_events_tier_idx
  on public.product_events (tier);

create index if not exists product_events_generation_path_idx
  on public.product_events (generation_path);

create index if not exists routing_events_occurred_at_idx
  on public.routing_events (occurred_at desc);

create index if not exists routing_events_feature_idx
  on public.routing_events (feature);

create index if not exists routing_events_platform_idx
  on public.routing_events (platform);

create index if not exists routing_events_tier_idx
  on public.routing_events (tier);

create index if not exists routing_events_path_taken_idx
  on public.routing_events (path_taken);

alter table public.product_events enable row level security;
alter table public.routing_events enable row level security;
