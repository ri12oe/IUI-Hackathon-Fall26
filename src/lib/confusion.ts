import type { EventType } from "./events";

export const LOST_WINDOW_MS = 60_000; // a lost tap counts for 60s
export const ACTIVE_WINDOW_MS = 120_000; // a device is active if seen in the last 2 min

export type ConfusionEvent = {
    id?: string;
    device_id: string;
    type: EventType;
    slide: number;
    created_at: string; // ISO timestamp from supabase
};

export type ConfusionStats = {
    lost: number;
    active: number;
    percent: number;
};

export function computeConfusion (
    events: ConfusionEvent[],
    now: number = Date.now()
): ConfusionStats {
    const active = new Set<string>();
    const lastLost = new Map<string, number>();
    const lastGotIt = new Map<string, number>();

    for (const e of events) {
        const t = Date.parse(e.created_at);
        if (now - t > ACTIVE_WINDOW_MS) continue; // too old to matter

        active.add(e.device_id);

        if (e.type === "lost") {
            lastLost.set(e.device_id, Math.max(lastLost.get(e.device_id) ?? 0, t));
        } else if (e.type === "got_it") {
            lastGotIt.set(e.device_id, Math.max(lastGotIt.get(e.device_id) ?? 0, t));
        }
    }

    let lost = 0;
    for (const [device, lostAt] of lastLost) {
        const recent = now - lostAt <= LOST_WINDOW_MS;
        const clearedAfter = (lastGotIt.get(device) ?? 0) > lostAt;
        if (recent && !clearedAfter) lost++;
    }
    return {
        lost,
        active: active.size,
        percent: active.size ? Math.round((lost / active.size) * 100) : 0,
    };
}

export type SlideConfusion = { slide: number; lost: number };

// How many different students tapped "lost" on each slide, worst first
export function confusionBySlide(events: ConfusionEvent[]): SlideConfusion[] {
  const bySlide = new Map<number, Set<string>>();

  for (const e of events) {
    if (e.type !== "lost") continue;
    if (!bySlide.has(e.slide)) bySlide.set(e.slide, new Set());
    bySlide.get(e.slide)!.add(e.device_id);
  }

  return [...bySlide]
    .map(([slide, devices]) => ({ slide, lost: devices.size }))
    .sort((a, b) => b.lost - a.lost || a.slide - b.slide);
}