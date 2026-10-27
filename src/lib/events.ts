import { supabase } from "./supabase";
import { ACTIVE_WINDOW_MS, type ConfusionEvent } from "./confusion";


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
    .select("device_id, type, slide, created_at")
    .eq("session_id", sessionId)
    .gte("created_at", since);

  if (error) throw error;
  return data as ConfusionEvent[];
}