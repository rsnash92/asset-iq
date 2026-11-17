-- Asset IQ — core schema: documents, chunks, query_logs + RLS + storage bucket.
-- See PLAN.md §6 and docs/DECISIONS.md.

create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- documents
-- ---------------------------------------------------------------------------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  storage_path text not null,
  mime_type text not null default 'application/pdf',
  content_type text not null check (content_type in
    ('whitepaper','case_study','webinar','ebook','guide','report','other')),
  industry text,
  published_at date,
  page_count int,
  status text not null default 'pending'
    check (status in ('pending','processing','ready','failed')),
  error text,
  source_url text,
  external_ref text,               -- stable key from sample-corpus manifest (evals map to it)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index documents_owner_idx on public.documents (owner_id, created_at desc);
create unique index documents_owner_external_ref_idx on public.documents (owner_id, external_ref) where external_ref is not null;
create index documents_status_idx on public.documents (status) where status in ('pending','processing');

-- ---------------------------------------------------------------------------
-- chunks
-- ---------------------------------------------------------------------------
create table public.chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  chunk_index int not null,
  page_start int not null,
  page_end int not null,
  content text not null,
  token_count int not null,
  embedding extensions.vector(1536) not null,
  fts tsvector generated always as (to_tsvector('english', content)) stored,
  unique (document_id, chunk_index)
);

create index chunks_embedding_idx on public.chunks using hnsw (embedding extensions.vector_cosine_ops);
create index chunks_fts_idx on public.chunks using gin (fts);
create index chunks_owner_idx on public.chunks (owner_id);
create index chunks_document_idx on public.chunks (document_id, chunk_index);

-- ---------------------------------------------------------------------------
-- query_logs
-- ---------------------------------------------------------------------------
create table public.query_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('chat','agent','search','eval')),
  query text not null,
  retrieved_chunk_ids uuid[],
  model text,
  input_tokens int,
  output_tokens int,
  embedding_tokens int,
  cost_usd numeric(10,6),
  latency_ms int,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index query_logs_user_idx on public.query_logs (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger documents_updated_at before update on public.documents
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: every row is owned; users see and change only their own.
-- The ingestion service and MCP server use the service-role key (bypasses RLS)
-- and always filter by owner_id explicitly.
-- ---------------------------------------------------------------------------
alter table public.documents enable row level security;
alter table public.chunks enable row level security;
alter table public.query_logs enable row level security;

create policy "documents: owner select" on public.documents
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "documents: owner insert" on public.documents
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "documents: owner update" on public.documents
  for update to authenticated using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "documents: owner delete" on public.documents
  for delete to authenticated using (owner_id = (select auth.uid()));

-- Chunks are written only by the ingestion service (service role); users may read/delete theirs.
create policy "chunks: owner select" on public.chunks
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "chunks: owner delete" on public.chunks
  for delete to authenticated using (owner_id = (select auth.uid()));

create policy "query_logs: owner select" on public.query_logs
  for select to authenticated using (user_id = (select auth.uid()));
create policy "query_logs: owner insert" on public.query_logs
  for insert to authenticated with check (user_id = (select auth.uid()));

-- Users may only flip status back to pending (re-ingest) or edit metadata; status
-- transitions to processing/ready/failed belong to the service. Enforced in the API layer.

-- ---------------------------------------------------------------------------
-- Storage: private bucket, objects stored under "<owner_id>/<document_id>/<file>"
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 20971520,
        array['application/pdf','text/markdown','text/plain','text/x-markdown'])
on conflict (id) do nothing;

create policy "storage: owner read" on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "storage: owner insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "storage: owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
