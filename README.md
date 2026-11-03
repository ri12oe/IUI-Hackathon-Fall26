# Muddy

**A silent, anonymous "I'm lost" button for live lectures, and a report that shows exactly where the class got stuck.**

Built for the IU Indianapolis Education Hackathon (October 2026).

## Links

https://hackathonfall26.vercel.app/join   (Student View)


https://hackathonfall26.vercel.app/host   (Teacher View)

## Project documentation

Read the [Muddy Hackathon project documentation](<public/Muddy — Hackathon Documentation.docx>) for more details about the project.

---

## The problem

In a 100-person lecture, instructors usually find out students were lost when the exam grades come back. Confused students rarely raise their hands: they don't want to look slow, they can't put the question into words yet, or the lecture has already moved on.

## What Muddy does

Muddy gives every student a one-tap, anonymous way to say "I'm lost" **while it's happening**, tied to the slide on screen.

- **Students** join from their phone with a 4-letter code or a QR scan. No account, no app.
- **Instructors** see how many students are lost right now, and get a quiet alert when it crosses a threshold.
- **After class**, the instructor gets a report showing where the class got lost, and students see the slides worth reviewing.

The name comes from the **"muddiest point"**, a well-known classroom technique where students write down the most confusing part of a lecture at the end of class. Muddy does the same thing live, slide by slide.

### How it's different

Slido, Mentimeter, and Poll Everywhere only collect feedback when the instructor asks a question. Muddy is a **continuous signal the student starts**:

- **Tied to slides**, so the feedback is still useful after class.
- **Fades after 60 seconds**, so the number means "lost right now," not a total that only goes up.
- **For both sides**: instructors get the report, students get a review list.
- **No setup**: no accounts and no LMS integration.
- **No AI and no API costs**: it runs on free tiers.

---

## Features

### Instructor
- **Setup**: course, lecture title, PDF slides, and alert level (25%, 35%, or 50% lost)
- **Lobby**: a projector screen with the room code, a QR code, and a live count of students who've joined
- **Presenting**: full-screen slides, a presenter bar with a "lost now" gauge, and a Live panel with a 5-minute trend and the most confusing slides
- **Alerts** when confusion crosses the chosen level, with a button to jump back to the slide where it started
- Works with arrow keys and presentation clickers
- Refreshing the page puts you back in your session

### Student
- Join by typing the code or scanning the QR code in the app
- A one-time welcome screen explaining that taps are anonymous and fade after a minute
- A large "I'm lost" button with a countdown, plus "Got it now"
- The current slide shown on the phone, following the instructor
- The screen stays awake during class
- An end-of-class screen with the three slides most people got lost on

### Report (`/report/:code`)
- A takeaway: which slide lost the most students, and when it peaked
- A timeline of the whole lecture in 30-second blocks, with the slide shown in each
- Slides ranked by how many students got lost, each opening a preview
- A summary: students, taps, peak, and length

---

## How it works

```
Student phones ──── heartbeat / lost / got_it ────▶ ┌────────────────────────┐
     ▲                                              │       Supabase         │
     └──────────── slide + status changes ───────── │  Postgres + Realtime   │
                                                    │  Anonymous Auth        │
Instructor ◀─────────── live counts ─────────────── │  Storage (PDF slides)  │
     └──────────── slide + status changes ────────▶ └────────────────────────┘
```

Each phone signs in anonymously and **joins** the room. That join is a membership row, not an event. While the room is still in the lobby, a phone only checks in. Those check-ins are not stored as events, so they can't move the confusion number. When the instructor starts class, Muddy records one heartbeat for each phone that was present in the last two minutes. After that, lost, got it, and heartbeats are events, and the server stamps the time. Every event records the current slide.

### The confusion number

```
lost now  =  phones whose latest "lost" tap was in the last 60 seconds
             (and that haven't tapped "got it" since)
             ─────────────────────────────────────────
             phones seen in the last 2 minutes
```

Each phone counts once, so tapping repeatedly can't inflate the number. The report replays the same calculation for every 30-second block of the lecture.

### Session lifecycle

`lobby` → `live` → `ended`. The host screen and every student phone switch screens automatically when the status changes.

---

## Tech stack

| Part | Technology |
|---|---|
| Frontend | React + TypeScript (Vite), Sass, React Router |
| Backend | Supabase: Postgres, Realtime, Anonymous Auth, Storage |
| Slides | pdf.js, rendered in the browser |
| QR codes | `qrcode.react` (showing), `qr-scanner` (scanning) |
| Hosting | Vercel |

---

## Getting started

### Requirements
- Node.js 20 or newer
- A free [Supabase](https://supabase.com) project

### 1. Install

```bash
git clone https://github.com/ri12oe/IUI-Hackathon-Fall26.git
cd IUI-Hackathon-Fall26
npm install
cp .env.example .env
```

Fill in `.env` with your project's URL and publishable (anon) key from **Project Settings → API Keys**:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-or-anon-key
# Optional: the address QR codes point to (useful when hosting from localhost)
# VITE_PUBLIC_URL=https://your-app.vercel.app
```

### 2. Set up the database

In the Supabase dashboard:
1. Turn on **Authentication → Sign In / Providers → Anonymous Sign-Ins**.
2. For a new project, paste [`supabase/schema.sql`](supabase/schema.sql) into the **SQL Editor** and run it. The same script is below.

Already running the older open policies? Don't re-run the whole script. Run [`supabase/migrations/20261103140000_privacy_boundaries.sql`](supabase/migrations/20261103140000_privacy_boundaries.sql) instead.

<details>
<summary>Database setup SQL</summary>

```sql
-- Fresh Muddy database. Paste this into the Supabase SQL editor.
-- Already deployed the old open policies? Run
-- supabase/migrations/20261103140000_privacy_boundaries.sql instead.

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

create or replace function public.join_session(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  s public.sessions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  perform public.purge_idle_participants();

  select * into s from public.sessions where room_code = upper(trim(p_code));
  if not found then
    raise exception 'No session found with that code.';
  end if;

  insert into public.participants (session_id, device_id)
  values (s.id, auth.uid())
  on conflict (session_id, device_id) do update
    set last_seen_at = now();

  return jsonb_build_object(
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
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into s from public.sessions where room_code = upper(trim(p_code));
  if not found then
    return jsonb_build_object('kind', 'missing');
  end if;
  if s.host_id is distinct from auth.uid() then
    return jsonb_build_object('kind', 'not-host');
  end if;

  return jsonb_build_object(
    'kind', 'ready',
    'session', jsonb_build_object(
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
    )
  );
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
```

</details>

### 3. Run it

```bash
npm run dev
```

- Instructor: `http://localhost:5173/host`
- Student: `http://localhost:5173/join`

Phones can't reach `localhost`, so to test with a real phone, deploy to Vercel (or set `VITE_PUBLIC_URL` so the QR code points at your deployed site).

### 4. Deploy to Vercel

Import the repo in Vercel; it detects Vite automatically. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under **Settings → Environment Variables**. The included `vercel.json` makes page refreshes and shared links work.

---

## Testing

### Confusion math

```bash
npx tsx src/lib/confusion.check.ts
```

### Simulated classroom

`scripts/simulate-students.mjs` signs in a room of fake students, joins through `join_session`, and sends heartbeats and taps through `record_event` — the same path as a phone. Mark some slides as hard, and most students get lost there:

```bash
node --env-file=.env scripts/simulate-students.mjs ABCD --students 20 --hard 5,8
```

In this command, `ABCD` is the room code for the active session. `--students 20` starts 20 simulated students. `--hard 5,8` marks slides 5 and 8 as hard, so students are more likely to get lost on those slides; it does not guarantee that they will.

Start a session, run the script with its room code, and present as usual. It stops when you end the session. Supabase limits anonymous sign-ins per hour, which you can raise under **Authentication → Rate Limits**.

After the SQL is applied, `npx tsx src/lib/confusion.check.ts` should still print PASS for every case. The math is unchanged. A second browser can join the room code and move the lobby count; once class is live, "I'm lost" moves the gauge. That browser cannot read `events` or someone else's session, and slide URLs are signed rather than public.

---

## Demo PDF

Place the PDF you plan to use for the demo at `public/demo.pdf`. Files in `public/` are served from the site root, so after deployment the PDF will be available at `/demo.pdf`.

There is currently an existing demo PDF that we will use during the presentation. If needed, feel free to make any changes to it.

---

## Project structure

```
supabase/
├── schema.sql              full database setup for a new project
└── migrations/             upgrade from the old open policies
scripts/
└── simulate-students.mjs   simulated classroom for testing
src/
├── components/             Logo, SlideViewer, PresenterBar, LivePanel, StudentRoom,
│                           Welcome, SessionEnded, QrScanSheet, alert toast, timer
├── hooks/                  live confusion, session updates, alerts, wake lock, trend
├── lib/
│   ├── confusion.ts        the lost-now calculation and per-slide counts
│   ├── report.ts           builds the report timeline from events
│   ├── events.ts           joining the write path and loading host aggregates
│   ├── session.ts          creating, joining and updating sessions
│   ├── slides.ts, pdf.ts   PDF upload and rendering
│   └── supabase.ts         Supabase client
├── pages/
│   ├── host/               Setup, Lobby, Presenting, HostSession
│   ├── Join.tsx            student entry
│   └── Report.tsx          post-lecture report
└── styles/                 design tokens and global styles
```

---

## Privacy

- No names, emails, or student accounts. Each phone gets a random anonymous id, and that id stays in the database.
- The browser never receives those ids. The live gauge, the report, and the student summary use counts or a per-lecture alias that changes every session.
- A signed-in visitor can read a session only if they host it, or they joined it with the room code. Event rows are not readable from the client. Realtime tells the host that a new event landed; it does not stream the event rows.
- Lost and got-it taps count only while the session is live, only from a phone that joined, and only a few times a minute. The server sets the timestamp. Lobby check-ins cannot inflate the number.
- A phone that has been idle for 12 hours is no longer a member. Those rows are deleted the next time someone joins or a session is created.
- Slide PDFs are in a private bucket. The app loads them with a signed URL that only the host and joined phones can mint.
- The instructor sees counts, never who tapped. Host controls still belong to the browser that started the session. Reports open only there.
- Repeat taps are ignored for 3 seconds in the app, and the database rejects a faster repeat.

---

## Roadmap

- Instructor sign-in, so sessions and reports follow you across devices
- Trends across a whole semester of lectures
- Anonymous questions attached to taps
- CSV export
- Canvas integration

---

## Demo

1. Judges scan the QR code on screen.
2. The pitch is presented through Muddy, including one deliberately dense slide.
3. Judges tap "I'm lost," and the gauge and alert respond live.
4. The pitch ends on the report of the presentation they just watched.

---

## Team

- **Mario (Rio) Espinoza-Gutierrez** ([@ri12oe](https://github.com/ri12oe))

## License

MIT
