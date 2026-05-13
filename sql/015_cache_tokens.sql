-- 015_cache_tokens.sql
-- Adds Anthropic prompt-cache token counts to cost_events so we can
-- verify caching is working and compute realised savings (cache reads
-- bill at 0.10x input rate vs 1.0x for uncached tokens).

alter table public.cost_events
  add column if not exists cache_creation_input_tokens integer not null default 0;

alter table public.cost_events
  add column if not exists cache_read_input_tokens integer not null default 0;
