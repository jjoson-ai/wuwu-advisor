-- Enable pgvector for semantic similarity search
create extension if not exists vector;

-- Table: durable facts extracted from Ask conversations.
-- Extraction runs async after each Ask turn; facts are used to personalise
-- subsequent responses. Users can inspect and delete facts from Settings.
create table if not exists public.user_facts (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users (id) on delete cascade,
  source_conversation_id uuid references public.ask_conversations (id) on delete cascade,
  fact_text              text not null,
  fact_category          text not null check (fact_category in (
                           'relational', 'situational', 'identity',
                           'ongoing_decision', 'preference'
                         )),
  -- Verbatim span from the source turn that grounds the fact (anti-hallucination).
  evidence_quote         text not null,
  confidence             real not null check (confidence >= 0 and confidence <= 1),
  -- text-embedding-3-small (1536 dims). Null until embedding job runs.
  embedding              vector(1536),
  extracted_at           timestamptz not null default now(),
  -- Updated when retrieval surfaces this fact; useful for future eviction.
  last_referenced_at     timestamptz,
  -- Self-FK: when "deciding to quit job" is superseded by "quit job".
  superseded_by          uuid references public.user_facts (id) on delete set null,
  -- Soft delete: prevents re-extraction of the same fact after user deletes it.
  user_deleted_at        timestamptz
);

-- Fast lookup for a user's live facts
create index if not exists user_facts_user_id_idx
  on public.user_facts (user_id)
  where user_deleted_at is null;

-- HNSW index for ANN cosine search (live facts only)
create index if not exists user_facts_embedding_hnsw
  on public.user_facts
  using hnsw (embedding vector_cosine_ops)
  where user_deleted_at is null and embedding is not null;

-- RLS: users may read and soft-delete their own facts.
-- Server-side inserts (extraction) use the admin client (bypasses RLS).
alter table public.user_facts enable row level security;

drop policy if exists "Users can view their own facts" on public.user_facts;
create policy "Users can view their own facts"
  on public.user_facts for select
  using (auth.uid() = user_id);

drop policy if exists "Users can update their own facts" on public.user_facts;
create policy "Users can update their own facts"
  on public.user_facts for update
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Retrieval function: returns top-K live facts by cosine similarity.
-- Used by the injection path on every Ask call.
-- ---------------------------------------------------------------------------
create or replace function match_user_facts(
  query_embedding   vector(1536),
  user_id_param     uuid,
  match_threshold   float,
  match_count       int
)
returns table (
  id              uuid,
  fact_text       text,
  fact_category   text,
  evidence_quote  text,
  confidence      real,
  extracted_at    timestamptz,
  similarity      float
)
language plpgsql security definer
as $$
begin
  return query
  select
    uf.id,
    uf.fact_text,
    uf.fact_category,
    uf.evidence_quote,
    uf.confidence,
    uf.extracted_at,
    (1 - (uf.embedding <=> query_embedding))::float as similarity
  from public.user_facts uf
  where uf.user_id      = user_id_param
    and uf.user_deleted_at is null
    and uf.superseded_by   is null
    and uf.embedding       is not null
    and (1 - (uf.embedding <=> query_embedding)) >= match_threshold
  order by uf.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Dedup + rejection-list check function.
-- Returns similar facts including soft-deleted ones; the caller decides
-- which to treat as duplicates (live) vs rejections (deleted).
-- ---------------------------------------------------------------------------
create or replace function find_similar_user_facts(
  query_embedding   vector(1536),
  user_id_param     uuid,
  match_threshold   float,
  match_count       int
)
returns table (
  id              uuid,
  fact_text       text,
  user_deleted_at timestamptz,
  similarity      float
)
language plpgsql security definer
as $$
begin
  return query
  select
    uf.id,
    uf.fact_text,
    uf.user_deleted_at,
    (1 - (uf.embedding <=> query_embedding))::float as similarity
  from public.user_facts uf
  where uf.user_id    = user_id_param
    and uf.superseded_by is null
    and uf.embedding     is not null
    and (1 - (uf.embedding <=> query_embedding)) >= match_threshold
  order by uf.embedding <=> query_embedding
  limit match_count;
end;
$$;
