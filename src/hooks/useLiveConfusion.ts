import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { fetchEventsAfter, fetchLiveSnapshot } from "../lib/events";
import {
  computeConfusion,
  confusionBySlide,
  ACTIVE_WINDOW_MS,
  type ConfusionEvent,
} from "../lib/confusion";

function merge(prev: ConfusionEvent[], incoming: ConfusionEvent[]) {
  const ids = new Set(prev.map((e) => e.id));
  return [...prev, ...incoming.filter((e) => e.id && !ids.has(e.id))];
}

export function useLiveConfusion(sessionId: string | undefined) {
  const [recent, setRecent] = useState<ConfusionEvent[]>([]); // last 2 min, for the meter
  const [lostAll, setLostAll] = useState<ConfusionEvent[]>([]); // every lost tap, for the slide list
  const [now, setNow] = useState(0);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    let afterId = 0;
    let ready = false;
    let fetching = false;
    let pending = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

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

    const note = (rows: ConfusionEvent[]) => {
      for (const row of rows) {
        const id = Number(row.id ?? 0);
        if (Number.isFinite(id) && id > afterId) afterId = id;
      }
    };

    const catchUp = async () => {
      if (!ready || cancelled) return;
      if (fetching) {
        pending = true;
        return;
      }
      fetching = true;
      try {
        do {
          pending = false;
          const rows = await fetchEventsAfter(sessionId, afterId);
          if (cancelled) return;
          if (rows.length) {
            addRecent(rows);
            addLost(rows);
            note(rows);
          }
        } while (pending && !cancelled);
      } finally {
        fetching = false;
      }
    };

    // One read per burst. The signal carries a counter, not the event rows.
    const schedule = () => {
      if (!ready || cancelled || timer) return;
      timer = setTimeout(() => {
        timer = null;
        catchUp().catch(console.error);
      }, 250);
    };

    const channel = supabase
      .channel(`signal:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "session_signals",
          filter: `session_id=eq.${sessionId}`,
        },
        () => schedule(),
      )
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
        if (status !== "SUBSCRIBED") return;
        fetchLiveSnapshot(sessionId)
          .then((snap) => {
            if (cancelled) return;
            const cutoff = Date.now() - ACTIVE_WINDOW_MS;
            setRecent(snap.recent.filter((e) => Date.parse(e.created_at) >= cutoff));
            setLostAll(snap.lost.filter((e) => e.type === "lost"));
            afterId = Number.isFinite(snap.cursor) ? snap.cursor : 0;
            note(snap.recent);
            note(snap.lost);
            ready = true;
            return catchUp();
          })
          .catch(console.error);
      });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
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
