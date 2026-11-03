import { supabase } from "./supabase";
import { type ConfusionEvent, type SlideConfusion } from "./confusion";

const PAGE_SIZE = 1000;
const MAX_ROWS = 100_000; // safety stop so a bug can't loop forever

export type EventType = "lost" | "got_it" | "heartbeat";

// device_key is a per-lecture alias. It is not auth.uid(), and it changes
// every session, so the confusion math can still group one phone's taps.
type HostEventRow = {
  id: number | string;
  device_key: string;
  type: EventType;
  slide: number;
  created_at: string;
};

function toConfusionEvent(row: HostEventRow): ConfusionEvent {
  return {
    id: String(row.id),
    device_id: row.device_key,
    type: row.type,
    slide: row.slide,
    created_at: row.created_at,
  };
}

function advance(cursor: number, rows: ConfusionEvent[]) {
  let next = cursor;
  for (const row of rows) {
    const id = Number(row.id ?? 0);
    if (Number.isFinite(id) && id > next) next = id;
  }
  return next;
}

export async function sendEvent(sessionId: string, type: EventType, slide: number) {
  const { error } = await supabase.rpc("record_event", {
    p_session_id: sessionId,
    p_type: type,
    p_slide: slide,
  });
  if (error) throw error;
}

export async function fetchLiveSnapshot(sessionId: string): Promise<{
  cursor: number;
  recent: ConfusionEvent[];
  lost: ConfusionEvent[];
}> {
  const { data, error } = await supabase.rpc("host_live_snapshot", {
    p_session_id: sessionId,
  });
  if (error) throw error;
  const snap = (data ?? {}) as {
    cursor?: number | string;
    recent?: HostEventRow[];
    lost?: HostEventRow[];
  };
  return {
    cursor: Number(snap.cursor ?? 0),
    recent: (snap.recent ?? []).map(toConfusionEvent),
    lost: (snap.lost ?? []).map(toConfusionEvent),
  };
}

async function fetchHostPage(sessionId: string, afterId: number, limit: number) {
  const { data, error } = await supabase.rpc("host_events", {
    p_session_id: sessionId,
    p_after_id: afterId,
    p_limit: limit,
  });
  if (error) throw error;
  return ((data ?? []) as HostEventRow[]).map(toConfusionEvent);
}

// Events the host has not applied yet. Raw device ids stay on the server.
export async function fetchEventsAfter(sessionId: string, afterId: number) {
  const rows: ConfusionEvent[] = [];
  let cursor = afterId;
  while (rows.length < MAX_ROWS) {
    const batch = await fetchHostPage(sessionId, cursor, PAGE_SIZE);
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    const next = advance(cursor, batch);
    if (next <= cursor) break;
    cursor = next;
  }
  return rows;
}

// Every event (heartbeats included), for the report. Aliased, host only.
export function fetchAllEvents(sessionId: string) {
  return fetchEventsAfter(sessionId, 0);
}

// Top three slides for a joined student after class. Counts only.
export async function fetchMuddiestSlides(sessionId: string): Promise<SlideConfusion[]> {
  const { data, error } = await supabase.rpc("muddiest_slides", {
    p_session_id: sessionId,
  });
  if (error) throw error;
  return (data ?? []) as SlideConfusion[];
}
