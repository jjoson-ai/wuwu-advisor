-- ask_conversations: one row per Ask question thread
create table if not exists public.ask_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ask_turns: follow-up exchanges within a conversation (turn_number >= 1)
create table if not exists public.ask_turns (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ask_conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  turn_number integer not null,
  user_message text not null,
  assistant_response text not null,
  suggested_followups jsonb not null default '[]',
  model_used text,
  created_at timestamptz not null default now(),
  unique (conversation_id, turn_number)
);

-- Link each decision_guidance row to its conversation
alter table public.decision_guidance
  add column if not exists conversation_id uuid references public.ask_conversations (id) on delete set null;

-- Backfill: create a conversation for each existing decision_guidance row
do $$
declare
  dg record;
  conv_id uuid;
begin
  for dg in
    select id, user_id, created_at
    from public.decision_guidance
    where conversation_id is null
  loop
    insert into public.ask_conversations (id, user_id, created_at)
    values (gen_random_uuid(), dg.user_id, dg.created_at)
    returning id into conv_id;

    update public.decision_guidance
    set conversation_id = conv_id
    where id = dg.id;
  end loop;
end $$;

-- Indexes
create index if not exists ask_conversations_user_id_idx on public.ask_conversations (user_id);
create index if not exists ask_turns_conversation_id_idx on public.ask_turns (conversation_id);
create index if not exists decision_guidance_conversation_id_idx on public.decision_guidance (conversation_id);

-- RLS
alter table public.ask_conversations enable row level security;
alter table public.ask_turns enable row level security;

drop policy if exists "Users can view their own ask conversations" on public.ask_conversations;
create policy "Users can view their own ask conversations"
on public.ask_conversations
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own ask conversations" on public.ask_conversations;
create policy "Users can insert their own ask conversations"
on public.ask_conversations
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can view their own ask turns" on public.ask_turns;
create policy "Users can view their own ask turns"
on public.ask_turns
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own ask turns" on public.ask_turns;
create policy "Users can insert their own ask turns"
on public.ask_turns
for insert
with check (auth.uid() = user_id);
