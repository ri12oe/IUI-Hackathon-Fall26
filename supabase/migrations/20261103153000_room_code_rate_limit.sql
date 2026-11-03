-- Rate-limit room-code guesses, and do not enroll on a probe.
-- Apply after 20261103140000_privacy_boundaries.sql.
-- New projects should run supabase/schema.sql instead of this file.

begin;

-- Room-code guesses. Not in the API. The guessed code is not stored.
-- probe: a wrong code, or a host lookup for a room this phone does not run.
--   uid: 8 / minute, 30 / hour. ip: 40 / 10 seconds, 80 / minute, 400 / hour.
-- enroll: the first join of a real code. A phone already in the room is free.
--   uid: 8 / hour. ip: 150 / 10 seconds, 300 / minute, 600 / hour.
-- create: inserting a session under a chosen code. A new code spends one when
--   the insert commits. uid: 10 / hour. ip: 30 / hour.
create schema if not exists private;

create table if not exists private.room_code_probes (
  id           bigint generated always as identity primary key,
  kind         text not null check (kind in ('probe', 'enroll', 'create')),
  subject      text not null check (subject in ('uid', 'ip')),
  subject_key  text not null,
  attempted_at timestamptz not null default now()
);

create index if not exists room_code_probes_lookup_idx
  on private.room_code_probes (kind, subject, subject_key, attempted_at desc);
create index if not exists room_code_probes_attempted_idx
  on private.room_code_probes (attempted_at);

alter table private.room_code_probes enable row level security;
revoke all on schema private from public, anon, authenticated;
revoke all on private.room_code_probes from public, anon, authenticated;

create or replace function private.client_ip()
returns inet
language plpgsql
stable
security invoker
set search_path = pg_catalog
as $$
declare
  headers json := current_setting('request.headers', true)::json;
  raw text;
begin
  if headers is null then
    return null;
  end if;
  -- Cloudflare sets this. Otherwise the first forwarded hop, per Supabase's API guide.
  raw := nullif(btrim(coalesce(headers->>'cf-connecting-ip', '')), '');
  if raw is null then
    raw := nullif(btrim(split_part(coalesce(headers->>'x-forwarded-for', ''), ',', 1)), '');
  end if;
  if raw is null then
    return null;
  end if;
  begin
    return raw::inet;
  exception
    when invalid_text_representation then
      return null;
  end;
end;
$$;

create or replace function private.session_payload(s public.sessions)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'id', s.id,
    'room_code', s.room_code,
    'current_slide', s.current_slide,
    'slide_count', s.slide_count,
    'slides_url', null,
    'slides_path', s.slides_path,
    'ended_at', s.ended_at,
    'course', s.course,
    'title', s.title,
    'alert_threshold', s.alert_threshold,
    'status', s.status,
    'presenting_started_at', s.presenting_started_at,
    'share_with_students', s.share_with_students
  );
$$;

create or replace function private.consume_room_code_attempt(p_kind text)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_uid_key text;
  v_ip_key text := host(private.client_ip());
  v_burst integer;
  v_minute integer;
  v_hour integer;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if p_kind not in ('probe', 'enroll', 'create') then
    raise exception 'invalid attempt';
  end if;

  v_uid_key := v_uid::text;
  perform pg_advisory_xact_lock(hashtextextended('muddy-room-uid:' || v_uid_key, 0));
  if v_ip_key is not null then
    perform pg_advisory_xact_lock(hashtextextended('muddy-room-ip:' || v_ip_key, 0));
  end if;

  if pg_try_advisory_xact_lock(hashtextextended('muddy-room-purge', 0)) then
    delete from private.room_code_probes
    where attempted_at < now() - interval '1 hour';
  end if;

  if p_kind = 'probe' then
    select
      (count(*) filter (where attempted_at > now() - interval '60 seconds'))::integer,
      (count(*) filter (where attempted_at > now() - interval '1 hour'))::integer
    into v_minute, v_hour
    from private.room_code_probes
    where kind = 'probe'
      and subject = 'uid'
      and subject_key = v_uid_key
      and attempted_at > now() - interval '1 hour';
    if v_minute >= 8 or v_hour >= 30 then
      raise exception 'slow down';
    end if;

    if v_ip_key is not null then
      select
        (count(*) filter (where attempted_at > now() - interval '10 seconds'))::integer,
        (count(*) filter (where attempted_at > now() - interval '60 seconds'))::integer,
        (count(*) filter (where attempted_at > now() - interval '1 hour'))::integer
      into v_burst, v_minute, v_hour
      from private.room_code_probes
      where kind = 'probe'
        and subject = 'ip'
        and subject_key = v_ip_key
        and attempted_at > now() - interval '1 hour';
      if v_burst >= 40 or v_minute >= 80 or v_hour >= 400 then
        raise exception 'slow down';
      end if;
    end if;
  elsif p_kind = 'enroll' then
    select (count(*))::integer
    into v_hour
    from private.room_code_probes
    where kind = 'enroll'
      and subject = 'uid'
      and subject_key = v_uid_key
      and attempted_at > now() - interval '1 hour';
    if v_hour >= 8 then
      raise exception 'slow down';
    end if;

    if v_ip_key is not null then
      select
        (count(*) filter (where attempted_at > now() - interval '10 seconds'))::integer,
        (count(*) filter (where attempted_at > now() - interval '60 seconds'))::integer,
        (count(*) filter (where attempted_at > now() - interval '1 hour'))::integer
      into v_burst, v_minute, v_hour
      from private.room_code_probes
      where kind = 'enroll'
        and subject = 'ip'
        and subject_key = v_ip_key
        and attempted_at > now() - interval '1 hour';
      if v_burst >= 150 or v_minute >= 300 or v_hour >= 600 then
        raise exception 'slow down';
      end if;
    end if;
  else
    select (count(*))::integer
    into v_hour
    from private.room_code_probes
    where kind = 'create'
      and subject = 'uid'
      and subject_key = v_uid_key
      and attempted_at > now() - interval '1 hour';
    if v_hour >= 10 then
      raise exception 'slow down';
    end if;

    if v_ip_key is not null then
      select (count(*))::integer
      into v_hour
      from private.room_code_probes
      where kind = 'create'
        and subject = 'ip'
        and subject_key = v_ip_key
        and attempted_at > now() - interval '1 hour';
      if v_hour >= 30 then
        raise exception 'slow down';
      end if;
    end if;
  end if;

  insert into private.room_code_probes (kind, subject, subject_key)
  values (p_kind, 'uid', v_uid_key);
  if v_ip_key is not null then
    insert into private.room_code_probes (kind, subject, subject_key)
    values (p_kind, 'ip', v_ip_key);
  end if;
end;
$$;

revoke all on function private.client_ip() from public, anon, authenticated;
revoke all on function private.session_payload(public.sessions) from public, anon, authenticated;
revoke all on function private.consume_room_code_attempt(text) from public, anon, authenticated;

-- Picking a room code by inserting a session is a lookup too. The guess counts
-- only when the new row commits, so a collision does not enroll anyone.
create or replace function public.limit_session_create()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or new.host_id is distinct from auth.uid() then
    raise exception 'not authenticated';
  end if;
  perform private.consume_room_code_attempt('create');
  return new;
end;
$$;

revoke all on function public.limit_session_create() from public, anon, authenticated;

drop trigger if exists sessions_limit_create on public.sessions;
create trigger sessions_limit_create
before insert on public.sessions
for each row execute function public.limit_session_create();

create or replace function public.join_session(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  s public.sessions%rowtype;
  v_code text := upper(trim(coalesce(p_code, '')));
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  perform public.purge_idle_participants();

  if v_code ~ '^[A-Z]{4}$' then
    select * into s from public.sessions where room_code = v_code;
  end if;

  -- Already in this room. Refresh presence; don't spend a guess or a new membership.
  if s.id is not null and exists (
    select 1 from public.participants p
    where p.session_id = s.id
      and p.device_id = auth.uid()
      and p.last_seen_at > now() - interval '12 hours'
  ) then
    update public.participants
    set last_seen_at = now()
    where session_id = s.id
      and device_id = auth.uid()
      and last_seen_at < now() - interval '10 seconds';
    return private.session_payload(s);
  end if;

  if s.id is null then
    -- Wrong code. NULL (not an exception) so the guess commits. No participant row.
    perform private.consume_room_code_attempt('probe');
    return null;
  end if;

  -- Intentional join. Over the cap, raise before inserting.
  perform private.consume_room_code_attempt('enroll');

  insert into public.participants (session_id, device_id)
  values (s.id, auth.uid())
  on conflict (session_id, device_id) do update
    set last_seen_at = now();

  return private.session_payload(s);
end;
$$;

create or replace function public.host_session_lookup(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  s public.sessions%rowtype;
  v_code text := upper(trim(coalesce(p_code, '')));
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if v_code ~ '^[A-Z]{4}$' then
    select * into s from public.sessions where room_code = v_code;
  end if;

  -- Opening your own room is not a guess and does not enroll anyone.
  if s.id is not null and s.host_id = auth.uid() then
    return jsonb_build_object('kind', 'ready', 'session', private.session_payload(s));
  end if;

  -- A miss and someone else's room share the guess budget. Neither writes participants.
  perform private.consume_room_code_attempt('probe');

  if s.id is null then
    return jsonb_build_object('kind', 'missing');
  end if;
  return jsonb_build_object('kind', 'not-host');
end;
$$;

revoke all on function public.join_session(text) from public, anon;
revoke all on function public.host_session_lookup(text) from public, anon;
grant execute on function public.join_session(text) to authenticated;
grant execute on function public.host_session_lookup(text) to authenticated;

notify pgrst, 'reload schema';

commit;
