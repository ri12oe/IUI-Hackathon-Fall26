// Simulates a room of students for testing Muddy.
// Usage: node --env-file=.env scripts/simulate-students.mjs ABCD --students 20 --hard 3,7
import { createClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;
const args = process.argv.slice(2);
const code = (args[0] ?? "").toUpperCase();
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

const N = Number(opt("students", 20));
const hard = new Set(String(opt("hard", "")).split(",").filter(Boolean).map(Number));
const TICK_MS = 2000;
const HARD_CHANCE = 0.06;    // chance per tick of getting lost on a hard slide
const NORMAL_CHANCE = 0.0015; // ...and on a normal slide

if (!url || !key) { console.error("Missing Supabase settings. Run with --env-file=.env"); process.exit(1); }
if (!/^[A-Z]{4}$/.test(code)) { console.error("Usage: node --env-file=.env scripts/simulate-students.mjs ABCD"); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);

// --- sign in N separate anonymous students ---
console.log(`Signing in ${N} students…`);
const students = [];
for (let i = 0; i < N; i++) {
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInAnonymously();
  if (error) {
    console.error(`Student ${i + 1} couldn't sign in: ${error.message}`);
    if (students.length === 0) process.exit(1);
    break;
  }
  students.push({ n: i + 1, sb, id: data.user.id, lostUntil: 0 });
  await sleep(150);
}

const { data: session } = await students[0].sb
  .from("sessions").select("id, current_slide, status").eq("room_code", code).maybeSingle();
if (!session) { console.error(`No session with the code ${code}.`); process.exit(1); }

let state = { slide: session.current_slide, status: session.status };
console.log(`${students.length} students in room ${code}. Hard slides: ${[...hard].join(", ") || "none"}. Ctrl+C to stop.`);

async function send(s, type) {
  const { error } = await s.sb.from("events").insert({
    session_id: session.id, device_id: s.id, type, slide: state.slide,
  });
  if (error) console.warn(`  student ${s.n} ${type} failed: ${error.message}`);
}

// --- follow the host's slide and status ---
setInterval(async () => {
  const { data } = await students[0].sb
    .from("sessions").select("current_slide, status").eq("id", session.id).single();
  if (!data) return;
  if (data.current_slide !== state.slide) console.log(`→ slide ${data.current_slide}`);
  if (data.status !== state.status) console.log(`→ status ${data.status}`);
  state = { slide: data.current_slide, status: data.status };
  if (data.status === "ended") { console.log("Session ended. Done."); process.exit(0); }
}, TICK_MS);

// --- each student's behavior ---
for (const s of students) {
  (async () => {
    await sleep(rand(0, 5000)); // don't all join at the same instant
    let nextBeat = 0;
    while (true) {
      const now = Date.now();
      if (now >= nextBeat) {
        send(s, "heartbeat");
        nextBeat = now + rand(28_000, 32_000);
      }
      if (state.status === "live") {
        const isHard = hard.has(state.slide);
        const lost = now < s.lostUntil;
        if (!lost && Math.random() < (isHard ? HARD_CHANCE : NORMAL_CHANCE)) {
          send(s, "lost");
          s.lostUntil = now + 60_000;
        } else if (lost && isHard && s.lostUntil - now < 5000 && Math.random() < 0.6) {
          send(s, "lost"); // still lost: tap again before it clears
          s.lostUntil = now + 60_000;
        } else if (lost && !isHard && Math.random() < 0.08) {
          send(s, "got_it"); // the next slide cleared it up
          s.lostUntil = 0;
        }
      }
      await sleep(TICK_MS);
    }
  })();
}