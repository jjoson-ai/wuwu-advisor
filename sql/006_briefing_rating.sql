-- 006_briefing_rating.sql
-- Accuracy feedback loop — Phase A (5.2 in roadmap).
--
-- Replaces the old 1-5 usefulness_score + acted_on briefing-feedback UI with
-- a lightweight emoji rating (🎯 nailed it / 🌫️ vague / 🙃 off) plus optional
-- per-theme "what hit / what missed" chips (6 themes: career, money,
-- relationships, health, personal_growth, timing).
--
-- Strategy: add new columns alongside old ones and relax NOT NULL on the
-- legacy columns so new rows don't need them. Old rows stay valid; new rows
-- carry rating_emoji and optionally rating_theme_hit[] / rating_theme_miss[].
-- We do not backfill — Phase B (weekly accuracy report) only reads the new
-- columns, and the old 1-5 scores are not comparable to the new emoji scale.
--
-- Roadmap reference: 5.2

-- ─────────────────────────────────────────────────────────────────────────────
-- briefing_feedback: new rating columns, relaxed legacy NOT NULL
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.briefing_feedback
  add column if not exists rating_emoji text
    check (rating_emoji in ('nailed_it', 'vague', 'off'));

alter table public.briefing_feedback
  add column if not exists rating_theme_hit text[] not null default '{}';

alter table public.briefing_feedback
  add column if not exists rating_theme_miss text[] not null default '{}';

-- Relax NOT NULL on legacy columns so new-shape rows (emoji-only) insert cleanly.
-- Existing rows keep their usefulness_score + acted_on values.
alter table public.briefing_feedback
  alter column usefulness_score drop not null;

alter table public.briefing_feedback
  alter column acted_on drop not null;

-- At least one of the two rating shapes must be present per row, otherwise the
-- row is noise. Enforces both "legacy row with 1-5 score" and "new row with
-- emoji" shapes, and lets future rollbacks coexist with existing data.
alter table public.briefing_feedback
  drop constraint if exists briefing_feedback_has_rating;
alter table public.briefing_feedback
  add constraint briefing_feedback_has_rating
  check (
    rating_emoji is not null
    or usefulness_score is not null
  );

-- Index for Phase B / accuracy dashboard: filter by rating_emoji over recent
-- windows (14d / 30d). Partial index keeps it small — only new-shape rows.
create index if not exists briefing_feedback_rating_emoji_idx
  on public.briefing_feedback (rating_emoji, created_at desc)
  where rating_emoji is not null;

-- GIN indexes so per-theme aggregation in /accuracy stays cheap as volume grows.
create index if not exists briefing_feedback_theme_hit_idx
  on public.briefing_feedback using gin (rating_theme_hit);

create index if not exists briefing_feedback_theme_miss_idx
  on public.briefing_feedback using gin (rating_theme_miss);
