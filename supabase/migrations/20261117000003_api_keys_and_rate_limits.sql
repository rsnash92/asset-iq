-- MCP API keys (Phase 3) and Postgres-backed rate limiting (Phase 4).

-- ---------------------------------------------------------------------------
-- api_keys: the plaintext key is shown once; only its SHA-256 hash is stored.
-- The MCP server resolves hash -> owner_id with the service role, then applies
-- owner_id filters on every query (RLS-equivalent isolation).
-- ---------------------------------------------------------------------------
create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  key_prefix text not null,
  key_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index api_keys_owner_idx on public.api_keys (owner_id);

alter table public.api_keys enable row level security;

create policy "api_keys: owner select" on public.api_keys
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "api_keys: owner insert" on public.api_keys
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "api_keys: owner update" on public.api_keys
  for update to authenticated using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "api_keys: owner delete" on public.api_keys
  for delete to authenticated using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- rate limiting: fixed window counter, one row per (user, bucket, window).
-- `consume_rate_limit` increments atomically and returns whether the call is allowed
-- plus when the window resets. SECURITY DEFINER so users cannot write the table
-- directly; the caller identity always comes from auth.uid() (or p_user_id for
-- the service role, e.g. the MCP server).
-- ---------------------------------------------------------------------------
create table public.rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (user_id, bucket, window_start)
);

alter table public.rate_limits enable row level security;
-- no policies: only reachable via the function below / service role.

create or replace function public.consume_rate_limit(
  p_bucket text,
  p_limit int,
  p_window_seconds int,
  p_user_id uuid default null
)
returns table (allowed boolean, remaining int, reset_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_window timestamptz;
  v_count int;
begin
  -- Only the service role may act on behalf of another user.
  if p_user_id is not null and coalesce(auth.role(), '') = 'service_role' then
    v_user := p_user_id;
  else
    v_user := auth.uid();
  end if;
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limits as r (user_id, bucket, window_start, count)
  values (v_user, p_bucket, v_window, 1)
  on conflict (user_id, bucket, window_start) do update set count = r.count + 1
  returning r.count into v_count;

  -- opportunistic cleanup of old windows for this user
  delete from public.rate_limits
  where user_id = v_user and window_start < now() - make_interval(secs => p_window_seconds * 2);

  allowed := v_count <= p_limit;
  remaining := greatest(p_limit - v_count, 0);
  reset_at := v_window + make_interval(secs => p_window_seconds);
  return next;
end $$;

revoke all on function public.consume_rate_limit from public, anon;
grant execute on function public.consume_rate_limit to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- usage summary for the Usage page (RLS applies: invoker sees own logs only)
-- ---------------------------------------------------------------------------
create or replace function public.usage_summary(p_days int default 30)
returns table (
  kind text,
  queries bigint,
  input_tokens bigint,
  output_tokens bigint,
  embedding_tokens bigint,
  cost_usd numeric,
  p50_latency_ms float8,
  p95_latency_ms float8,
  errors bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select l.kind,
         count(*),
         coalesce(sum(l.input_tokens), 0),
         coalesce(sum(l.output_tokens), 0),
         coalesce(sum(l.embedding_tokens), 0),
         coalesce(sum(l.cost_usd), 0),
         percentile_cont(0.5) within group (order by l.latency_ms),
         percentile_cont(0.95) within group (order by l.latency_ms),
         count(*) filter (where l.error is not null)
  from public.query_logs l
  where l.created_at >= now() - make_interval(days => p_days)
  group by l.kind
  order by l.kind;
$$;

grant execute on function public.usage_summary to authenticated;
