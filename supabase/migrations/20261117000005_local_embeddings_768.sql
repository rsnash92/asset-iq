-- Switch embeddings from OpenAI text-embedding-3-small (1536-d) to the local,
-- open-source nomic-embed-text-v1.5 (768-d) served by the ingestion service.
-- Existing vectors can't be converted between models, so chunks are cleared and
-- every document is queued for re-ingestion (status -> pending).

drop function if exists public.match_chunks_hybrid(
  extensions.vector, text, int, text[], text[], date, date, uuid, uuid[], text, int, int);

delete from public.chunks;
update public.documents set status = 'pending', error = null where status in ('ready', 'failed', 'processing');

drop index if exists public.chunks_embedding_idx;
alter table public.chunks alter column embedding type extensions.vector(768);
create index chunks_embedding_idx on public.chunks using hnsw (embedding extensions.vector_cosine_ops);

create or replace function public.match_chunks_hybrid(
  query_embedding extensions.vector(768),
  query_text text,
  match_count int default 8,
  filter_content_type text[] default null,
  filter_industry text[] default null,
  filter_after date default null,
  filter_before date default null,
  filter_owner uuid default null,
  filter_document_ids uuid[] default null,
  search_mode text default 'hybrid',
  candidate_count int default 50,
  rrf_k int default 60
)
returns table (
  id uuid,
  document_id uuid,
  chunk_index int,
  page_start int,
  page_end int,
  content text,
  token_count int,
  document_title text,
  content_type text,
  industry text,
  published_at date,
  external_ref text,
  vector_rank int,
  keyword_rank int,
  vector_score float8,
  keyword_score float8,
  rrf_score float8
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with
  params as (
    -- Natural-language questions rarely contain *every* term of a passage, so the
    -- AND semantics of plainto_tsquery are too strict. Take its normalised lexemes
    -- and OR them; ts_rank_cd still rewards passages matching more terms.
    select case
      when search_mode = 'vector' then null
      else to_tsquery('simple',
             nullif(replace(plainto_tsquery('english', coalesce(query_text, ''))::text, ' & ', ' | '), ''))
    end as tsq
  ),
  eligible as (
    select c.id, c.document_id, c.embedding, c.fts
    from public.chunks c
    join public.documents d on d.id = c.document_id
    where d.status = 'ready'
      and (filter_owner is null or c.owner_id = filter_owner)
      and (filter_content_type is null or d.content_type = any (filter_content_type))
      and (filter_industry is null or d.industry = any (filter_industry))
      and (filter_after is null or d.published_at >= filter_after)
      and (filter_before is null or d.published_at <= filter_before)
      and (filter_document_ids is null or c.document_id = any (filter_document_ids))
  ),
  vector_hits as (
    select e.id,
           (row_number() over (order by e.embedding <=> query_embedding))::int as rank,
           1 - (e.embedding <=> query_embedding) as score
    from eligible e
    where search_mode in ('hybrid', 'vector')
    order by e.embedding <=> query_embedding
    limit candidate_count
  ),
  keyword_hits as (
    select e.id,
           (row_number() over (order by ts_rank_cd(e.fts, p.tsq) desc))::int as rank,
           ts_rank_cd(e.fts, p.tsq)::float8 as score
    from eligible e, params p
    where search_mode in ('hybrid', 'keyword')
      and p.tsq is not null
      and e.fts @@ p.tsq
    order by ts_rank_cd(e.fts, p.tsq) desc
    limit candidate_count
  ),
  fused as (
    select coalesce(v.id, k.id) as id,
           v.rank as vector_rank,
           k.rank as keyword_rank,
           v.score as vector_score,
           k.score as keyword_score,
           coalesce(1.0 / (rrf_k + v.rank), 0) + coalesce(1.0 / (rrf_k + k.rank), 0) as rrf_score
    from vector_hits v
    full outer join keyword_hits k on k.id = v.id
  )
  select c.id, c.document_id, c.chunk_index, c.page_start, c.page_end, c.content, c.token_count,
         d.title, d.content_type, d.industry, d.published_at, d.external_ref,
         f.vector_rank, f.keyword_rank, f.vector_score, f.keyword_score, f.rrf_score::float8
  from fused f
  join public.chunks c on c.id = f.id
  join public.documents d on d.id = c.document_id
  order by f.rrf_score desc, f.vector_rank asc nulls last
  limit match_count;
$$;

grant execute on function public.match_chunks_hybrid to authenticated, service_role;

-- replace_document_chunks casts to the new dimension
create or replace function public.replace_document_chunks(
  p_document_id uuid,
  p_page_count int,
  p_chunks jsonb
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_count int;
begin
  select owner_id into v_owner from public.documents where id = p_document_id for update;
  if v_owner is null then
    raise exception 'document % not found', p_document_id;
  end if;

  delete from public.chunks where document_id = p_document_id;

  insert into public.chunks (document_id, owner_id, chunk_index, page_start, page_end, content, token_count, embedding)
  select p_document_id, v_owner,
         (c->>'chunk_index')::int, (c->>'page_start')::int, (c->>'page_end')::int,
         c->>'content', (c->>'token_count')::int,
         (c->>'embedding')::extensions.vector(768)
  from jsonb_array_elements(p_chunks) c;
  get diagnostics v_count = row_count;

  update public.documents
     set status = 'ready', error = null, page_count = p_page_count
   where id = p_document_id;
  return v_count;
end $$;


revoke all on function public.replace_document_chunks from public, anon, authenticated;
grant execute on function public.replace_document_chunks to service_role;
