import { computeConfusion, type ConfusionEvent } from "./confusion";

const now = Date.parse("2026-10-27T15:00:00Z");
const ago = (s: number) => new Date(now - s * 1000).toISOString();
const ev = (device_id: string, type: ConfusionEvent["type"], secondsAgo: number): ConfusionEvent =>
  ({ device_id, type, slide: 1, created_at: ago(secondsAgo) });

const cases: [string, ConfusionEvent[], { lost: number; active: number; percent: number }][] = [
  ["nobody here", [], { lost: 0, active: 0, percent: 0 }],
  ["1 of 2 lost", [ev("a", "heartbeat", 10), ev("b", "lost", 5)], { lost: 1, active: 2, percent: 50 }],
  ["lost tap expired", [ev("a", "lost", 90)], { lost: 0, active: 1, percent: 0 }],
  ["got it clears lost", [ev("a", "lost", 20), ev("a", "got_it", 10)], { lost: 0, active: 1, percent: 0 }],
  ["lost again after got it", [ev("a", "lost", 30), ev("a", "got_it", 20), ev("a", "lost", 5)], { lost: 1, active: 1, percent: 100 }],
  ["spam counts once", [ev("a", "lost", 3), ev("a", "lost", 2), ev("a", "lost", 1), ev("b", "heartbeat", 5)], { lost: 1, active: 2, percent: 50 }],
  ["inactive device ignored", [ev("a", "heartbeat", 200), ev("b", "lost", 5)], { lost: 1, active: 1, percent: 100 }],
];

for (const [name, events, expected] of cases) {
  const got = computeConfusion(events, now);
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`, ok ? "" : { got, expected });
}