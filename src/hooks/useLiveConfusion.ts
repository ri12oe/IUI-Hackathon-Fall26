import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { fetchLostEvents, fetchRecentEvents } from "../lib/events";
import {
  computeConfusion,
  confusionBySlide,
  ACTIVE_WINDOW_MS,
  type ConfusionEvent,
} from "../lib/confusion";

// Merge new events into a list, skipping ones already there
function merge(prev: ConfusionEvent[], incoming: ConfusionEvent[]) {
  const ids = new Set(prev.map((e) => e.id));
  return [...prev, ...incoming.filter((e) => !ids.has(e.id))];
}

export function useLiveConfusion(sessionId: string | undefined) {
  const [recent, setRecent] = useState<ConfusionEvent[]>([]);     // last 2 min, for the meter
  const [lostAll, setLostAll] = useState<ConfusionEvent[]>([]);   // every lost tap, for the slide list
  const [now, setNow] = useState(0);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    const addRecent = (incoming: ConfusionEvent[]) => {
      setRecent((prev) => {
        const cutoff = Date.now() - ACTIVE_WINDOW_MS;
        return merge(prev, incoming).filter((e) => Date.parse(e.created_at) >= cutoff);
      });
    };

    const addLost = (incoming: ConfusionEvent[]) => {
      const lost = incoming.filter((e) => e.type === "lost");
      if (lost.length) setLostAll((prev) => merge(prev, lost));
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
        (payload) => {
          const e = payload.new as ConfusionEvent;
          addRecent([e]);
          addLost([e]);
        }
      )
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") {
          fetchRecentEvents(sessionId)
            .then((rows) => !cancelled && addRecent(rows))
            .catch(console.error);
          fetchLostEvents(sessionId)
            .then((rows) => !cancelled && addLost(rows))
            .catch(console.error);
        }
      });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  useEffect(() => {
    const updateNow = () => setNow(Date.now());
    const initialUpdate = setTimeout(updateNow, 0);
    const interval = setInterval(updateNow, 1000);
    return () => {
      clearTimeout(initialUpdate);
      clearInterval(interval);
    };
  }, []);

  const stats = useMemo(() => computeConfusion(recent, now), [recent, now]);
  const bySlide = useMemo(() => confusionBySlide(lostAll), [lostAll]);

  return { stats, bySlide, connected };
}