import { supabase } from "./supabase";
import { ACTIVE_WINDOW_MS, type ConfusionEvent } from "./confusion";


const EVENT_COLUMNS = "id, device_id, type, slide, created_at";
const PAGE_SIZE = 1000;
const MAX_ROWS = 100_000; // safety stop so a bug can't loop forever

export type EventType = "lost" | "got_it" | "heartbeat";

export async function sendEvent(
    sessionId: string,
    deviceId: string,
    type: EventType,
    slide: number
) {
    const { error } = await supabase.from("events").insert({
        session_id: sessionId,
        device_id: deviceId,
        type,
        slide,
    });
    if (error) throw error;
}

export async function fetchRecentEvents(sessionId: string): Promise<ConfusionEvent[]> {
  const since = new Date(Date.now() - ACTIVE_WINDOW_MS).toISOString();

  const { data, error } = await supabase
    .from("events")
    .select("id, device_id, type, slide, created_at")
    .eq("session_id", sessionId)
    .gte("created_at", since);

  if (error) throw error;
  return data as ConfusionEvent[];
}



// Loads every matching event for a session, in id order, one batch at a time
async function fetchAllPages(sessionId: string, type?: EventType): Promise<ConfusionEvent[]> {
  const rows: ConfusionEvent[] = [];
  let total: number | null = null;

  while (rows.length < MAX_ROWS) {
    const response = type
      ? await supabase
          .from("events")
          .select(EVENT_COLUMNS, total === null ? { count: "exact" } : undefined)
          .eq("session_id", sessionId)
          .eq("type", type)
          .order("id", { ascending: true })
          .range(rows.length, rows.length + PAGE_SIZE - 1)
      : await supabase
          .from("events")
          .select(EVENT_COLUMNS, total === null ? { count: "exact" } : undefined)
          .eq("session_id", sessionId)
          .order("id", { ascending: true })
          .range(rows.length, rows.length + PAGE_SIZE - 1);
    const { data, error, count } = response;

    if (error) throw error;
    const expectedTotal: number = total ?? count ?? 0;
    total = expectedTotal;

    const batch = (data ?? []) as ConfusionEvent[];
    rows.push(...batch);

    // Done when we have everything, or the server has nothing more to give
    if (rows.length >= expectedTotal || batch.length === 0) break;
  }

  return rows;
}

// Every event (heartbeats included), for the report
export function fetchAllEvents(sessionId: string) {
  return fetchAllPages(sessionId);
}

// Only "lost" taps, for the live panel and the student end screen
export function fetchLostEvents(sessionId: string) {
  return fetchAllPages(sessionId, "lost");
}