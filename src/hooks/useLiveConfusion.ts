import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { fetchRecentEvents } from "../lib/events";
import {
  computeConfusion,
  ACTIVE_WINDOW_MS,
  type ConfusionEvent,
} from "../lib/confusion";

export function useLiveConfusion(sessionId: string | undefined) {
  const [events, setEvents] = useState<ConfusionEvent[]>([]);
  const [now, setNow] = useState(0);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    // Add events, skip duplicates, and drop anything too old to matter
    const add = (incoming: ConfusionEvent[]) => {
      setEvents((prev) => {
        const ids = new Set(prev.map((e) => e.id));
        const cutoff = Date.now() - ACTIVE_WINDOW_MS;
        return [...prev, ...incoming.filter((e) => !ids.has(e.id))].filter(
          (e) => Date.parse(e.created_at) >= cutoff
        );
      });
    };

    const channel = supabase
      .channel(`events:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "events",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => add([payload.new as ConfusionEvent])
      )
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") {
          // Load recent history once live updates are flowing (also after reconnects)
          fetchRecentEvents(sessionId)
            .then((rows) => !cancelled && add(rows))
            .catch(console.error);
        }
      });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  // Tick every second so lost taps fade out on time
  useEffect(() => {
    const updateNow = () => setNow(Date.now());
    const initialUpdate = setTimeout(updateNow, 0);
    const interval = setInterval(updateNow, 1000);
    return () => {
      clearTimeout(initialUpdate);
      clearInterval(interval);
    };
  }, []);

  const stats = useMemo(() => computeConfusion(events, now), [events, now]);

  return { stats, connected };
}