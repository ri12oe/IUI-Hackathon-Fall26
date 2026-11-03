-- Fresh Muddy database. Paste this into the Supabase SQL editor.
-- Already applied an older version? Do not re-run this file.
--   Open policies only: run supabase/migrations/20261103140000_privacy_boundaries.sql,
--   then 20261103153000_room_code_rate_limit.sql,
--   then 20261103170000_freeze_room_code.sql.
--   Privacy migration already applied: run the rate-limit migration, then the freeze migration.
--   Rate-limit migration already applied: run the freeze migration only.

begin;

-- Tables
create table public.sessions (
  id                    uuid primary key default gen_random_uuid(),
  room_code             text unique not null,
  host_id               uuid not null,
  current_slide         int  not null default 1,
  slide_count           int,
  slides_path           text,
  slides_url            text,
  course                text,
  title                 text,
  alert_threshold       int  not null default 35 check (alert_threshold between 5 and 95),
  status                text not null default 'lobby' check (status in ('lobby', 'live', 'ended')),
  share_with_students   boolean not null default true,
  started_at            timestamptz default now(),
  presenting_started_at timestamptz,
  ended_at              timestamptz
);

create table public.events (
  id          bigint generated always as identity primary key,
  session_id  uuid references public.sessions(id) on delete cascade,
  device_id   uuid not null,
  type        text check (type in ('lost', 'got_it', 'heartbeat')),
  slide       int  not null,
  created_at  timestamptz not null default now()
);

create table public.participants (
  session_id   uuid not null references public.sessions(id) on delete cascade,
  device_id     uuid not null,
  joined_at     timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  primary key (session_id, device_id)
);

create table public.session_signals (
  session_id uuid primary key references public.sessions(id) on delete cascade,
  tick       bigint not null default 0
);

create table public.session_notes (
  session_id uuid primary key references public.sessions(id) on delete cascade,
  body       text not null default '' check (char_length(body) <= 5000),
  updated_at timestamptz not null default now()
);

create index on public.events (session_id, created_at);
create index on public.events (session_id, id);
create index events_session_device_created_idx
  on public.events (session_id, device_id, created_at desc);
create index participants_last_seen_idx
  on public.participants (last_seen_at);

alter table public.session_signals replica identity full;

-- Realtime: session fields for the room, a counter for the host. Not events.
alter publication supabase_realtime add table public.sessions, public.session_signals;

-- Helpers. device_key is a per-lecture alias, not auth.uid().
create or replace function public.device_key(p_session_id uuid, p_device_id uuid)
returns text
language sql
immutable
set search_path = public
as $$
  select md5(p_session_id::text || ':' || p_device_id::text);
$$;

create or replace function public.is_host(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.sessions s
    where s.id = p_session_id and s.host_id = auth.uid()
  );
$$;

create or replace function public.is_participant(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.participants p
    where p.session_id = p_session_id
      and p.device_id = auth.uid()
      and p.last_seen_at > now() - interval '12 hours'
  );
$$;

create or replace function public.purge_idle_participants()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.participants
  where last_seen_at < now() - interval '12 hours';
$$;

create or replace function public.can_read_slide(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  folder text;
  session_id uuid;
begin
  folder := (storage.foldername(object_name))[1];
  if folder is null then
    return false;
  end if;
  begin
    session_id := folder::uuid;
  exception
    when invalid_text_representation then
      return false;
  end;
  return public.is_host(session_id) or public.is_participant(session_id);
end;
$$;

-- muddy.seed is set only by seed_presence_on_live, for this transaction.
create or replace function public.enforce_event_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_recent integer;
  v_seed boolean := coalesce(current_setting('muddy.seed', true), '') = 'on';
begin
  if tg_op = 'UPDATE' then
    raise exception 'events are immutable';
  end if;

  if new.created_at is not null
     and abs(extract(epoch from (new.created_at - now()))) > 5 then
    raise exception 'created_at is set by the server';
  end if;
  new.created_at := now();

  if new.type not in ('lost', 'got_it', 'heartbeat') then
    raise exception 'invalid event type';
  end if;
  if new.slide is null or new.slide < 1 or new.slide > 10000 then
    raise exception 'invalid slide';
  end if;

  select s.status into v_status from public.sessions s where s.id = new.session_id;
  if v_status is distinct from 'live' then
    raise exception 'session is not live';
  end if;

  if v_seed then
    if auth.uid() is null or not public.is_host(new.session_id) then
      raise exception 'cannot spoof device';
    end if;
    if not exists (
      select 1 from public.participants p
      where p.session_id = new.session_id
        and p.device_id = new.device_id
        and p.last_seen_at > now() - interval '2 minutes'
    ) then
      raise exception 'not a participant';
    end if;
  else
    if auth.uid() is null then
      raise exception 'not authenticated';
    end if;
    if new.device_id is distinct from auth.uid() then
      raise exception 'cannot spoof device';
    end if;
    if not public.is_participant(new.session_id) then
      raise exception 'not a participant';
    end if;

    perform pg_advisory_xact_lock(hashtextextended(new.session_id::text || new.device_id::text, 0));

    select count(*) into v_recent
    from public.events e
    where e.session_id = new.session_id
      and e.device_id = new.device_id
      and e.created_at > now() - interval '60 seconds';
    if v_recent >= 40 then
      raise exception 'slow down';
    end if;

    if exists (
      select 1 from public.events e
      where e.session_id = new.session_id
        and e.device_id = new.device_id
        and e.type = new.type
        and e.created_at > now() - interval '1 second'
    ) then
      raise exception 'slow down';
    end if;
  end if;

  update public.participants
  set last_seen_at = now()
  where session_id = new.session_id and device_id = new.device_id;

  return new;
end;
$$;

create or replace function public.bump_session_signal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.session_signals (session_id, tick)
  values (new.session_id, 1)
  on conflict (session_id) do update
    set tick = public.session_signals.tick + 1;
  return new;
end;
$$;

create or replace function public.ensure_session_signal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.session_signals (session_id) values (new.id)
  on conflict (session_id) do nothing;
  perform public.purge_idle_participants();
  return new;
end;
$$;

create or replace function public.seed_presence_on_live()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'UPDATE'
     or new.status is distinct from 'live'
     or old.status = 'live'
     or not public.is_host(new.id) then
    return new;
  end if;

  perform set_config('muddy.seed', 'on', true);

  insert into public.events (session_id, device_id, type, slide)
  select p.session_id, p.device_id, 'heartbeat', greatest(new.current_slide, 1)
  from public.participants p
  where p.session_id = new.id
    and p.last_seen_at > now() - interval '2 minutes'
    and not exists (
      select 1 from public.events e
      where e.session_id = p.session_id
        and e.device_id = p.device_id
        and e.type = 'heartbeat'
        and e.created_at > now() - interval '1 second'
    );

  perform set_config('muddy.seed', 'off', true);
  return new;
end;
$$;

create trigger events_enforce_write
before insert or update on public.events
for each row execute function public.enforce_event_write();

create trigger events_bump_signal
after insert on public.events
for each row execute function public.bump_session_signal();

create trigger sessions_ensure_signal
after insert on public.sessions
for each row execute function public.ensure_session_signal();

create trigger sessions_seed_presence
after update on public.sessions
for each row execute function public.seed_presence_on_live();

-- Room-code guesses. Not in the API. The guessed code is not stored.
-- probe: a wrong code, or a host lookup for a room this phone does not run.
--   uid: 8 / minute, 30 / hour. ip: 40 / 10 seconds, 80 / minute, 400 / hour.
-- enroll: the first join of a real code. A phone already in the room is free.
--   uid: 8 / hour. ip: 150 / 10 seconds, 300 / minute, 600 / hour.
-- create: inserting a session under a chosen code. A new code spends one when
--   the insert commits. uid: 10 / hour. ip: 30 / hour.
create schema if not exists private;

create table private.room_code_probes (
  id           bigint generated always as identity primary key,
  kind         text not null check (kind in ('probe', 'enroll', 'create')),
  subject      text not null check (subject in ('uid', 'ip')),
  subject_key  text not null,
  attempted_at timestamptz not null default now()
);

create index room_code_probes_lookup_idx
  on private.room_code_probes (kind, subject, subject_key, attempted_at desc);
create index room_code_probes_attempted_idx
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

create trigger sessions_limit_create
before insert on public.sessions
for each row execute function public.limit_session_create();

-- room_code is fixed at insert. An update that changes it would be an
-- unthrottled existence check: unique violation means the code is taken.
create or replace function public.freeze_room_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.room_code is distinct from old.room_code then
    raise exception 'room code cannot be changed';
  end if;
  return new;
end;
$$;

revoke all on function public.freeze_room_code() from public, anon, authenticated;

create trigger sessions_freeze_room_code
before update of room_code on public.sessions
for each row execute function public.freeze_room_code();

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

create or replace function public.record_event(p_session_id uuid, p_type text, p_slide integer)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_status text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if p_type not in ('lost', 'got_it', 'heartbeat') then
    raise exception 'invalid event type';
  end if;
  if p_slide is null or p_slide < 1 or p_slide > 10000 then
    raise exception 'invalid slide';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_session_id::text || v_uid::text, 0));

  select s.status into v_status from public.sessions s where s.id = p_session_id;
  if v_status is null then
    raise exception 'session not found';
  end if;
  if not public.is_participant(p_session_id) then
    raise exception 'not a participant';
  end if;

  if v_status = 'lobby' and p_type = 'heartbeat' then
    update public.participants
    set last_seen_at = now()
    where session_id = p_session_id
      and device_id = v_uid
      and last_seen_at < now() - interval '10 seconds';
    return;
  end if;

  if v_status is distinct from 'live' then
    raise exception 'session is not live';
  end if;

  insert into public.events (session_id, device_id, type, slide)
  values (p_session_id, v_uid, p_type, p_slide);
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

create or replace function public.host_live_snapshot(p_session_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_host(p_session_id) then
    raise exception 'not allowed';
  end if;

  -- One statement, so the cursor and the rows are the same snapshot.
  select jsonb_build_object(
    'cursor', (
      select coalesce(max(e.id), 0)
      from public.events e
      where e.session_id = p_session_id
    ),
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'device_key', public.device_key(e.session_id, e.device_id),
        'type', e.type,
        'slide', e.slide,
        'created_at', e.created_at
      ) order by e.id)
      from public.events e
      where e.session_id = p_session_id
        and e.created_at >= now() - interval '2 minutes'
    ), '[]'::jsonb),
    'lost', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'device_key', public.device_key(e.session_id, e.device_id),
        'type', e.type,
        'slide', e.slide,
        'created_at', e.created_at
      ) order by e.id)
      from (
        select ev.id, ev.session_id, ev.device_id, ev.type, ev.slide, ev.created_at
        from public.events ev
        where ev.session_id = p_session_id
          and ev.type = 'lost'
        order by ev.id
        limit 100000
      ) e
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

create or replace function public.host_events(
  p_session_id uuid,
  p_after_id bigint default 0,
  p_limit integer default 1000
)
returns table (
  id bigint,
  device_key text,
  type text,
  slide integer,
  created_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_host(p_session_id) then
    raise exception 'not allowed';
  end if;

  return query
  select e.id,
         public.device_key(e.session_id, e.device_id),
         e.type,
         e.slide,
         e.created_at
  from public.events e
  where e.session_id = p_session_id
    and e.id > coalesce(p_after_id, 0)
  order by e.id
  limit least(greatest(coalesce(p_limit, 1000), 1), 1000);
end;
$$;

create or replace function public.muddiest_slides(p_session_id uuid)
returns table (slide integer, lost integer)
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.sessions s
    where s.id = p_session_id
      and s.status = 'ended'
      and s.share_with_students
      and public.is_participant(s.id)
  ) then
    return;
  end if;

  return query
  select e.slide, count(distinct e.device_id)::integer as lost
  from public.events e
  where e.session_id = p_session_id and e.type = 'lost'
  group by e.slide
  order by count(distinct e.device_id) desc, e.slide
  limit 3;
end;
$$;

create or replace function public.participant_count(p_session_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_host(p_session_id) then
    raise exception 'not allowed';
  end if;
  return (
    select count(*)::integer
    from public.participants p
    where p.session_id = p_session_id
      and p.last_seen_at > now() - interval '2 minutes'
  );
end;
$$;

revoke all on function public.device_key(uuid, uuid) from public, anon, authenticated;
revoke all on function public.purge_idle_participants() from public, anon, authenticated;
revoke all on function public.enforce_event_write() from public, anon, authenticated;
revoke all on function public.bump_session_signal() from public, anon, authenticated;
revoke all on function public.ensure_session_signal() from public, anon, authenticated;
revoke all on function public.seed_presence_on_live() from public, anon, authenticated;

revoke all on function public.is_host(uuid) from public, anon;
revoke all on function public.is_participant(uuid) from public, anon;
revoke all on function public.can_read_slide(text) from public, anon;
grant execute on function public.is_host(uuid) to authenticated;
grant execute on function public.is_participant(uuid) to authenticated;
grant execute on function public.can_read_slide(text) to authenticated;

revoke all on function public.join_session(text) from public, anon;
revoke all on function public.record_event(uuid, text, integer) from public, anon;
revoke all on function public.host_session_lookup(text) from public, anon;
revoke all on function public.host_live_snapshot(uuid) from public, anon;
revoke all on function public.host_events(uuid, bigint, integer) from public, anon;
revoke all on function public.muddiest_slides(uuid) from public, anon;
revoke all on function public.participant_count(uuid) from public, anon;
grant execute on function public.join_session(text) to authenticated;
grant execute on function public.record_event(uuid, text, integer) to authenticated;
grant execute on function public.host_session_lookup(text) to authenticated;
grant execute on function public.host_live_snapshot(uuid) to authenticated;
grant execute on function public.host_events(uuid, bigint, integer) to authenticated;
grant execute on function public.muddiest_slides(uuid) to authenticated;
grant execute on function public.participant_count(uuid) to authenticated;

alter table public.sessions enable row level security;
alter table public.events enable row level security;
alter table public.participants enable row level security;
alter table public.session_signals enable row level security;
alter table public.session_notes enable row level security;

revoke all on public.events from anon, authenticated;
revoke all on public.participants from anon, authenticated;
revoke all on public.session_signals from anon, authenticated;
grant select on public.session_signals to authenticated;

create policy "host reads own sessions" on public.sessions
  for select to authenticated using (host_id = auth.uid());
create policy "participant reads joined session" on public.sessions
  for select to authenticated using (public.is_participant(id));
create policy "host creates session" on public.sessions
  for insert to authenticated with check (host_id = auth.uid());
create policy "host updates session" on public.sessions
  for update to authenticated
  using (host_id = auth.uid())
  with check (host_id = auth.uid());

create policy "host reads signal" on public.session_signals
  for select to authenticated using (public.is_host(session_id));

create policy "host reads notes" on public.session_notes for select to authenticated
  using (exists (select 1 from public.sessions s where s.id = session_id and s.host_id = auth.uid()));
create policy "host writes notes" on public.session_notes for insert to authenticated
  with check (exists (select 1 from public.sessions s where s.id = session_id and s.host_id = auth.uid()));
create policy "host updates notes" on public.session_notes for update to authenticated
  using (exists (select 1 from public.sessions s where s.id = session_id and s.host_id = auth.uid()));

-- Private slide bucket. The app mints a signed URL for the host and joined phones.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('slides', 'slides', false, 26214400, array['application/pdf'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "host uploads slides" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'slides'
    and exists (
      select 1 from public.sessions s
      where s.id::text = (storage.foldername(name))[1] and s.host_id = auth.uid()
    )
  );

create policy "session members read slides" on storage.objects
  for select to authenticated
  using (bucket_id = 'slides' and public.can_read_slide(name));

notify pgrst, 'reload schema';

commit;
