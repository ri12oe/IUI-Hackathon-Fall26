import { supabase } from "./supabase";

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