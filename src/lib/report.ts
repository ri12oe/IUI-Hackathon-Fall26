import {
  ACTIVE_WINDOW_MS,
  computeConfusion,
  confusionBySlide,
  type ConfusionEvent,
} from "./confusion";
import type { Session } from "./session";

export const BUCKET_MS = 30_000;

export type Bucket = {
  index: number;
  start: number;
  end: number;
  percent: number;
  lost: number;
  active: number;
  slide: number | null;
};
export type Lane = { slide: number; from: number; length: number };
export type SlideRow = { slide: number; lost: number; peak: number };
export type Takeaway = {
  slide: number;
  lost: number;
  peak: number;
  peakAt: number;
  spillsInto: number | null;
};
export type Report = {
  start: number;
  end: number;
  durationMin: number;
  students: number;
  lostTaps: number;
  lostStudents: number;
  buckets: Bucket[];
  lanes: Lane[];
  slides: SlideRow[];
  peak: Bucket | null;
  takeaway: Takeaway | null;
};

// Most frequent value in a list (null if empty)
function mode(values: number[]): number | null {
  const counts = new Map<number, number>();
  let best: number | null = null;
  let bestCount = 0;
  for (const v of values) {
    const n = (counts.get(v) ?? 0) + 1;
    counts.set(v, n);
    if (n > bestCount) {
      best = v;
      bestCount = n;
    }
  }
  return best;
}

export function buildReport(session: Session, raw: ConfusionEvent[]): Report {
  const events = raw
    .map((e) => ({ e, t: Date.parse(e.created_at) }))
    .sort((a, b) => a.t - b.t);

  const first = events[0]?.t ?? Date.now();
  const last = events[events.length - 1]?.t ?? first;
  const start = session.presenting_started_at ? Date.parse(session.presenting_started_at) : first;
  const end = Math.max(start + BUCKET_MS, session.ended_at ? Date.parse(session.ended_at) : last);

  // --- 30-second blocks, using a sliding 2-minute window of events ---
  const count = Math.ceil((end - start) / BUCKET_MS);
  const buckets: Bucket[] = [];
  let lo = 0;
  let hi = 0;

  for (let i = 0; i < count; i++) {
    const bStart = start + i * BUCKET_MS;
    const bEnd = Math.min(end, bStart + BUCKET_MS);

    while (hi < events.length && events[hi].t <= bEnd) hi++;
    while (lo < hi && events[lo].t < bEnd - ACTIVE_WINDOW_MS) lo++;

    const windowEvents = events.slice(lo, hi);
    const stats = computeConfusion(windowEvents.map((x) => x.e), bEnd);
    const slidesInBlock = windowEvents.filter((x) => x.t >= bStart).map((x) => x.e.slide);

    buckets.push({ index: i, start: bStart, end: bEnd, ...stats, slide: mode(slidesInBlock) });
  }

  // Blocks with no events keep the previous block's slide
  let lastSlide: number | null = null;
  for (const b of buckets) {
    if (b.slide === null) b.slide = lastSlide;
    else lastSlide = b.slide;
  }

  // --- Slide lanes: merge runs of the same slide ---
  const lanes: Lane[] = [];
  for (const b of buckets) {
    if (b.slide === null) continue;
    const prev = lanes[lanes.length - 1];
    if (prev && prev.slide === b.slide && prev.from + prev.length === b.index) prev.length++;
    else lanes.push({ slide: b.slide, from: b.index, length: 1 });
  }

  // --- Per-slide ranking, with each slide's highest % ---
  const slides: SlideRow[] = confusionBySlide(raw).map(({ slide, lost }) => ({
    slide,
    lost,
    peak: Math.max(0, ...buckets.filter((b) => b.slide === slide).map((b) => b.percent)),
  }));

  // --- Totals ---
  const lostEvents = raw.filter((e) => e.type === "lost");
  const peak = buckets.reduce<Bucket | null>((best, b) => (!best || b.percent > best.percent ? b : best), null);

  // --- The takeaway: the slide that lost the most students ---
  let takeaway: Takeaway | null = null;
  const top = slides[0];
  if (top) {
    const onSlide = buckets.filter((b) => b.slide === top.slide);
    const peakBucket = onSlide.reduce((best, b) => (b.percent > best.percent ? b : best), onSlide[0] ?? buckets[0]);
    const next = slides.find((s) => s.slide === top.slide + 1);
    takeaway = {
      slide: top.slide,
      lost: top.lost,
      peak: top.peak,
      peakAt: peakBucket?.end ?? start,
      spillsInto: next && next.lost >= Math.max(2, top.lost * 0.5) ? next.slide : null,
    };
  }

  return {
    start,
    end,
    durationMin: Math.max(1, Math.round((end - start) / 60_000)),
    students: new Set(raw.map((e) => e.device_id)).size,
    lostTaps: lostEvents.length,
    lostStudents: new Set(lostEvents.map((e) => e.device_id)).size,
    buckets,
    lanes,
    slides,
    peak,
    takeaway,
  };
}