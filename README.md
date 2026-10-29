# Muddy

**A silent, anonymous "I'm lost" button for live lectures, and a report that shows exactly where the class got stuck.**

Built for the IU Indianapolis Education Hackathon (October 2026).

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
Instructor ◀─────────── live events ─────────────── │  Storage (PDF slides)  │
     └──────────── slide + status changes ────────▶ └────────────────────────┘
```

Each phone signs in anonymously, sends a **heartbeat** every 30 seconds, and sends a **lost** or **got it** event when tapped. Every event records the current slide.

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
2. Run the SQL below in the **SQL Editor**.

<details>
<summary>Database setup SQL</summary>

```sql
-- Tables
create table public.sessions (
  id                    uuid primary key default gen_random_uuid(),
  room_code             text unique not null,
  host_id               uuid not null,
  current_slide         int  not null default 1,
  slide_count           int,
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
  created_at  timestamptz default now()
);

create table public.session_notes (
  session_id uuid primary key references public.sessions(id) on delete cascade,
  body       text not null default '' check (char_length(body) <= 5000),
  updated_at timestamptz not null default now()
);

create index on public.events (session_id, created_at);
create index on public.events (session_id, id);

-- Realtime
alter publication supabase_realtime add table public.sessions, public.events;

-- Row-level security
alter table public.sessions      enable row level security;
alter table public.events        enable row level security;
alter table public.session_notes enable row level security;

create policy "read sessions" on public.sessions for select to authenticated using (true);
create policy "read events"   on public.events   for select to authenticated using (true);

create policy "host creates session" on public.sessions
  for insert to authenticated with check (host_id = auth.uid());
create policy "host updates session" on public.sessions
  for update to authenticated using (host_id = auth.uid());

create policy "add own events" on public.events
  for insert to authenticated
  with check (
    device_id = auth.uid()
    and exists (select 1 from public.sessions s where s.id = session_id and s.status <> 'ended')
  );

create policy "host reads notes" on public.session_notes for select to authenticated
  using (exists (select 1 from public.sessions s where s.id = session_id and s.host_id = auth.uid()));
create policy "host writes notes" on public.session_notes for insert to authenticated
  with check (exists (select 1 from public.sessions s where s.id = session_id and s.host_id = auth.uid()));
create policy "host updates notes" on public.session_notes for update to authenticated
  using (exists (select 1 from public.sessions s where s.id = session_id and s.host_id = auth.uid()));

-- Slide storage (public bucket, PDFs only, 25 MB max)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('slides', 'slides', true, 26214400, array['application/pdf'])
on conflict (id) do nothing;

create policy "host uploads slides" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'slides'
    and exists (
      select 1 from public.sessions s
      where s.id::text = (storage.foldername(name))[1] and s.host_id = auth.uid()
    )
  );
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

`scripts/simulate-students.mjs` signs in a room of fake students that send heartbeats and taps through the same rules as real phones. Mark some slides as hard, and most students get lost there:

```bash
node --env-file=.env scripts/simulate-students.mjs ABCD --students 20 --hard 5,8
```

Start a session, run the script with its room code, and present as usual. It stops when you end the session. Supabase limits anonymous sign-ins per hour, which you can raise under **Authentication → Rate Limits**.

---

## Project structure

```
scripts/
└── simulate-students.mjs   simulated classroom for testing
src/
├── components/             Logo, SlideViewer, PresenterBar, LivePanel, StudentRoom,
│                           Welcome, SessionEnded, QrScanSheet, alert toast, timer
├── hooks/                  live confusion, session updates, alerts, wake lock, trend
├── lib/
│   ├── confusion.ts        the lost-now calculation and per-slide counts
│   ├── report.ts           builds the report timeline from events
│   ├── events.ts           sending events and loading them in batches
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

- No names, emails, or student accounts: each phone gets a random anonymous ID.
- The instructor sees counts, never who tapped.
- Repeat taps are ignored for 3 seconds in the app.
- Host access belongs to the browser that started the session. Reports open only there.

**Hackathon limitations:** any signed-in visitor can read session and event data (which is anonymous), and "share with students" controls what the app shows, not who can query the data. Tighter access rules and server-side rate limits are on the roadmap.

---

## Roadmap

- Instructor sign-in, so sessions and reports follow you across devices
- Trends across a whole semester of lectures
- Anonymous questions attached to taps
- CSV export
- Server-side rate limits and stricter data access
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