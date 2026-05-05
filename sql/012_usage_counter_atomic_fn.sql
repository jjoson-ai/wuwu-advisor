-- ─────────────────────────────────────────────────────────────────────────────
-- 012_usage_counter_atomic_fn.sql — Atomic check-and-increment for free-tier
-- DoS gating
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Context:
--   The original 010_usage_counters migration used a TS-side read-then-write
--   pattern: getUsageCount() then conditional increment. Concurrent requests
--   could both read the same value and both pass the gate, letting free-tier
--   users exceed daily limits. Codex review on PR #1 surfaced this race.
--
--   Fix: a SECURITY DEFINER function that increments only when count < limit,
--   returning whether the increment succeeded. Postgres serializes the
--   conditional UPDATE on the row's PK so concurrent calls cannot both
--   increment past the limit.
--
-- Behavior:
--   - If no row exists for (user_id, period_key, feature): inserts count=1,
--     returns (1, true) — first use of the feature this period.
--   - If row exists with count < p_limit: increments by 1, returns (new_count,
--     true) — under the cap.
--   - If row exists with count >= p_limit: leaves count unchanged, returns
--     (current_count, false) — over the cap, caller should 429.
--
--   The conditional UPDATE acquires a row lock; concurrent calls serialize
--   on that lock. Whichever transaction commits first wins; subsequent
--   concurrent calls see the updated count and may not pass the cap.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.try_increment_usage_counter(
  p_user_id uuid,
  p_period_key text,
  p_feature text,
  p_limit integer
) returns table(new_count integer, was_incremented boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer;
  current_count integer;
begin
  -- Step 1: ensure a row exists. ON CONFLICT DO NOTHING — if another
  -- transaction inserted concurrently we'll fall through to the UPDATE.
  insert into public.usage_counters (user_id, period_key, feature, count, updated_at)
  values (p_user_id, p_period_key, p_feature, 0, now())
  on conflict (user_id, period_key, feature) do nothing;

  -- Step 2: conditional atomic increment. Postgres holds a row lock for the
  -- duration of this UPDATE so two concurrent callers serialize and observe
  -- each other's writes — the second sees the post-increment count and
  -- correctly fails the WHERE clause when at the cap.
  update public.usage_counters
  set count = count + 1,
      updated_at = now()
  where user_id = p_user_id
    and period_key = p_period_key
    and feature = p_feature
    and count < p_limit
  returning count into updated_count;

  if updated_count is not null then
    return query select updated_count, true;
    return;
  end if;

  -- Step 3: increment was rejected — read the current count to return.
  select count into current_count
  from public.usage_counters
  where user_id = p_user_id
    and period_key = p_period_key
    and feature = p_feature;

  return query select coalesce(current_count, 0), false;
end;
$$;

-- Grant execute to authenticated users (the app calls this via the
-- service-role client, so this is mostly for defense in depth — service-role
-- bypasses RLS and grant restrictions, but explicit grants make the intent
-- legible).
grant execute on function public.try_increment_usage_counter(uuid, text, text, integer)
  to service_role;
