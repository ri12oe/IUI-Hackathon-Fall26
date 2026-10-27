# Confusion Heatmap

**A silent, anonymous "I'm lost" button for live lectures — and a heatmap that shows exactly where the class got stuck.**

> Built for the IU Indianapolis Education Hackathon (Oct 2026).

---

## The Problem

In a 100-person lecture, instructors usually learn students were lost when exam grades come back. Confused students rarely raise their hands, they don't want to look slow, can't phrase the question yet, or the lecture has already moved on. Feedback arrives when it's too late to help.

## The Solution

Confusion Heatmap gives every student a one-tap, anonymous way to signal confusion **in the moment**, tied to the slide being shown.

- **Students** tap "I'm lost" from their phone, no account, no app install.
- **Instructors** see a calm, live meter of how many students are lost right now.
- **Everyone** gets a post-lecture heatmap showing which slides caused the most confusion.

### How it's different

Tools like Slido, Mentimeter, and Poll Everywhere are *prompted* — they only collect feedback when the instructor asks a question. Confusion Heatmap is a **continuous, unprompted signal** that is:

- **Slide-linked** — confusion is mapped to specific slides, so it's useful after class, not just during.
- **Time-decayed** — each tap fades after ~60 seconds, so the meter reflects confusion *now*, not a total that only rises.
- **Two-sided** — students see the map too, so it doubles as a study guide ("review slides 12 and 18").
- **Zero setup** — join with a room code or QR. No accounts, no LMS integration.
- **No AI, no API costs** — runs entirely on free-tier infrastructure.



## Features

### Student view (`/join`)
- Join by 4-letter room code or QR scan
- Current slide displayed in sync with the instructor
- Big **I'm lost** button (decays after 60s) and a **Got it now** button
- Optional anonymous question attached to a tap

### Instructor view (`/host`)
- Create a session and upload slides (PDF)
- Advance slides — every student's screen follows
- Live confusion meter (% of active students currently lost)
- Threshold alert, e.g. *"35% lost on slide 12"*
- Anonymous questions grouped by slide, with upvotes

### Post-lecture report (`/report/:code`)
- Timeline heatmap of the full lecture
- Ranked list of most-confusing slides
- CSV export (stretch)

---

## How It Works

```
Soon to be released 
```

### Confusion calculation

At any moment:

```
confusion % = devices with a "lost" tap in the last 60s
              ─────────────────────────────────────────
              devices active in the last 2 minutes
```

- Each device is counted **once per window**, so repeated tapping can't inflate the number.
- The heatmap buckets events into **30-second slots** and also aggregates **per slide**.

---

## Tech Stack

| Layer      | Technology                                   |
|------------|----------------------------------------------|
| Frontend   | React + TypeScript (Vite), Sass              |
| Backend    | Supabase (Postgres, Realtime, Anonymous Auth)|
| Slides     | pdf.js (client-side PDF rendering)           |
| Charts     | D3 / Recharts                                |
| QR codes   | `qrcode.react`                               |
| Hosting    | Vercel (frontend), Supabase free tier        |





## Getting Started

TBA

---

## Project Structure (Concept)

```
src/
├── pages/
│   ├── Join.tsx          # student entry + lost button
│   ├── Host.tsx          # instructor live view
│   └── Report.tsx        # post-lecture heatmap
├── components/
│   ├── LostButton.tsx
│   ├── ConfusionMeter.tsx
│   ├── SlideViewer.tsx   # pdf.js wrapper
│   ├── Heatmap.tsx
│   └── QuestionList.tsx
├── lib/
│   ├── supabase.ts       # client setup
│   ├── session.ts        # create/join, room codes
│   └── confusion.ts      # windowing + aggregation logic
├── styles/               # Sass partials
└── main.tsx
```

---

## Privacy

- No names, emails, or student accounts — only a random anonymous device ID.
- Questions are anonymous and capped at 280 characters.
- Taps are rate-limited per device to prevent spam.
- Anonymity is the point: it's what makes students willing to tap.

---

## Roadmap

**Hackathon MVP**
- [ ] Room code + QR join with anonymous device IDs
- [ ] Lost / got-it events over Realtime with 60s decay
- [ ] Live confusion % meter
- [ ] PDF upload and slide sync
- [ ] Post-lecture heatmap + slide ranking

**Stretch**
- [ ] Anonymous questions with upvotes
- [ ] Threshold alerts and "quiet mode" for instructors
- [ ] CSV export

**Beyond the hackathon**
- [ ] Instructor accounts and saved sessions
- [ ] Semester-long trends across lectures
- [ ] Canvas integration
- [ ] Accessibility audit (screen readers, high-contrast mode)

---

## Demo

1. Judges scan the QR code on screen.
2. The pitch is presented *through* the tool — including one intentionally dense slide.
3. Judges tap "I'm lost" and the live meter spikes.
4. The pitch ends by opening the heatmap of the presentation just given.

---

## Team

- **Mario (Rio) Espinoza-Gutierrez** — [@ri12oe](https://github.com/ri12oe)

## License

MIT