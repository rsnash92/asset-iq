-- RPCs used by the Python ingestion service (service role only).

-- Atomically claim the oldest pending document (or a specific one) so that the
-- polling worker and the POST /ingest trigger never process the same document twice.
-- Documents stuck in 'processing' for > 15 minutes (crashed worker) are reclaimable.
create or replace function public.claim_document(p_document_id uuid default null)
returns setof public.documents
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update public.documents d
     set status = 'processing', error = null
   where d.id = (
     select x.id from public.documents x
      where (p_document_id is null or x.id = p_document_id)
        and (x.status = 'pending'
             or (x.status = 'processing' and x.updated_at < now() - interval '15 minutes'))
      order by x.created_at
      limit 1
      for update skip locked
   )
  returning d.*;
end $$;

-- Replace all chunks of a document in one transaction (idempotent re-ingest),
-- then mark it ready. p_chunks: [{chunk_index, page_start, page_end, content, token_count, embedding}]
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
         (c->>'embedding')::extensions.vector(1536)
  from jsonb_array_elements(p_chunks) c;
  get diagnostics v_count = row_count;

  update public.documents
     set status = 'ready', error = null, page_count = p_page_count
   where id = p_document_id;
  return v_count;
end $$;

revoke all on function public.claim_document from public, anon, authenticated;
revoke all on function public.replace_document_chunks from public, anon, authenticated;
grant execute on function public.claim_document to service_role;
grant execute on function public.replace_document_chunks to service_role;
