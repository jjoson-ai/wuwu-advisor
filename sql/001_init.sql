create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  timezone text not null,
  tone_preference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.birth_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  birth_date date not null,
  birth_time text,
  birth_time_confidence text not null,
  birth_city text not null,
  birth_country text not null,
  full_birth_name_for_numerology text,
  bazi_calculation_marker text,
  birth_latitude double precision,
  birth_longitude double precision,
  birth_timezone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.birth_data add column if not exists full_birth_name_for_numerology text;
alter table public.birth_data add column if not exists bazi_calculation_marker text;
alter table public.birth_data add column if not exists birth_latitude double precision;
alter table public.birth_data add column if not exists birth_longitude double precision;
alter table public.birth_data add column if not exists birth_timezone text;

create table if not exists public.daily_briefings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  briefing_date date not null,
  astrology_context_json jsonb,
  numerology_context_json jsonb,
  freeastro_context_json jsonb,
  western_payload_json jsonb not null,
  timing_payload_json jsonb not null,
  synthesis_payload_json jsonb not null,
  generation_access_level text,
  created_at timestamptz not null default now(),
  unique (user_id, briefing_date)
);

create table if not exists public.briefing_feedback (
  id uuid primary key default gen_random_uuid(),
  briefing_id uuid not null references public.daily_briefings (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  usefulness_score integer not null check (usefulness_score between 1 and 5),
  acted_on text not null check (acted_on in ('yes', 'partial', 'no')),
  note text,
  created_at timestamptz not null default now(),
  unique (briefing_id, user_id)
);

create table if not exists public.user_blueprints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade unique,
  blueprint_json jsonb not null,
  bazi_debug_json jsonb,
  generation_access_level text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_forecasts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade unique,
  forecast_json jsonb not null,
  numerology_context_json jsonb,
  generation_access_level text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.decision_guidance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  question_text text not null,
  decision_type text,
  decision_horizon text,
  decision_intent text,
  decision_feasibility text,
  guidance_json jsonb not null,
  numerology_context_json jsonb,
  generation_access_level text,
  created_at timestamptz not null default now()
);

create table if not exists public.decision_guidance_feedback (
  id uuid primary key default gen_random_uuid(),
  decision_guidance_id uuid not null references public.decision_guidance (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  usefulness_score integer not null check (usefulness_score between 1 and 5),
  acted_on text not null check (acted_on in ('yes', 'partial', 'no')),
  note text,
  created_at timestamptz not null default now(),
  unique (decision_guidance_id, user_id)
);

alter table public.daily_briefings add column if not exists astrology_context_json jsonb;
alter table public.daily_briefings add column if not exists numerology_context_json jsonb;
alter table public.daily_briefings add column if not exists freeastro_context_json jsonb;
alter table public.daily_briefings add column if not exists generation_access_level text;
alter table public.briefing_feedback add column if not exists note text;
alter table public.user_blueprints add column if not exists blueprint_json jsonb;
alter table public.user_blueprints add column if not exists bazi_debug_json jsonb;
alter table public.user_blueprints add column if not exists generation_access_level text;
alter table public.user_blueprints add column if not exists updated_at timestamptz not null default now();
alter table public.user_forecasts add column if not exists forecast_json jsonb;
alter table public.user_forecasts add column if not exists numerology_context_json jsonb;
alter table public.user_forecasts add column if not exists generation_access_level text;
alter table public.user_forecasts add column if not exists updated_at timestamptz not null default now();
alter table public.decision_guidance add column if not exists guidance_json jsonb;
alter table public.decision_guidance add column if not exists numerology_context_json jsonb;
alter table public.decision_guidance add column if not exists generation_access_level text;
alter table public.decision_guidance add column if not exists decision_type text;
alter table public.decision_guidance add column if not exists decision_horizon text;
alter table public.decision_guidance add column if not exists decision_intent text;
alter table public.decision_guidance add column if not exists decision_feasibility text;
alter table public.decision_guidance_feedback add column if not exists note text;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists set_birth_data_updated_at on public.birth_data;
create trigger set_birth_data_updated_at
before update on public.birth_data
for each row
execute function public.set_updated_at();

drop trigger if exists set_user_blueprints_updated_at on public.user_blueprints;
create trigger set_user_blueprints_updated_at
before update on public.user_blueprints
for each row
execute function public.set_updated_at();

drop trigger if exists set_user_forecasts_updated_at on public.user_forecasts;
create trigger set_user_forecasts_updated_at
before update on public.user_forecasts
for each row
execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.birth_data enable row level security;
alter table public.daily_briefings enable row level security;
alter table public.briefing_feedback enable row level security;
alter table public.user_blueprints enable row level security;
alter table public.user_forecasts enable row level security;
alter table public.decision_guidance enable row level security;
alter table public.decision_guidance_feedback enable row level security;

drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Users can view their own profile"
on public.profiles
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
on public.profiles
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
on public.profiles
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can view their own birth data" on public.birth_data;
create policy "Users can view their own birth data"
on public.birth_data
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own birth data" on public.birth_data;
create policy "Users can insert their own birth data"
on public.birth_data
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own birth data" on public.birth_data;
create policy "Users can update their own birth data"
on public.birth_data
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can view their own daily briefings" on public.daily_briefings;
create policy "Users can view their own daily briefings"
on public.daily_briefings
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own daily briefings" on public.daily_briefings;
create policy "Users can insert their own daily briefings"
on public.daily_briefings
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own daily briefings" on public.daily_briefings;
create policy "Users can update their own daily briefings"
on public.daily_briefings
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can view their own briefing feedback" on public.briefing_feedback;
create policy "Users can view their own briefing feedback"
on public.briefing_feedback
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own briefing feedback" on public.briefing_feedback;
create policy "Users can insert their own briefing feedback"
on public.briefing_feedback
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own briefing feedback" on public.briefing_feedback;
create policy "Users can update their own briefing feedback"
on public.briefing_feedback
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can view their own blueprints" on public.user_blueprints;
create policy "Users can view their own blueprints"
on public.user_blueprints
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own blueprints" on public.user_blueprints;
create policy "Users can insert their own blueprints"
on public.user_blueprints
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own blueprints" on public.user_blueprints;
create policy "Users can update their own blueprints"
on public.user_blueprints
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can view their own forecasts" on public.user_forecasts;
create policy "Users can view their own forecasts"
on public.user_forecasts
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own forecasts" on public.user_forecasts;
create policy "Users can insert their own forecasts"
on public.user_forecasts
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own forecasts" on public.user_forecasts;
create policy "Users can update their own forecasts"
on public.user_forecasts
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can view their own decision guidance" on public.decision_guidance;
create policy "Users can view their own decision guidance"
on public.decision_guidance
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own decision guidance" on public.decision_guidance;
create policy "Users can insert their own decision guidance"
on public.decision_guidance
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own decision guidance" on public.decision_guidance;
create policy "Users can update their own decision guidance"
on public.decision_guidance
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can view their own decision guidance feedback" on public.decision_guidance_feedback;
create policy "Users can view their own decision guidance feedback"
on public.decision_guidance_feedback
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own decision guidance feedback" on public.decision_guidance_feedback;
create policy "Users can insert their own decision guidance feedback"
on public.decision_guidance_feedback
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own decision guidance feedback" on public.decision_guidance_feedback;
create policy "Users can update their own decision guidance feedback"
on public.decision_guidance_feedback
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
