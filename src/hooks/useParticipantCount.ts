import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const POLL_MS = 3000;

// Phones in the room during the last 2 minutes. Lobby heartbeats are not events.
export function useParticipantCount(sessionId: string | undefined) {
  const [count, setCount] = useState(0);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    const pull = async () => {
      const { data, error } = await supabase.rpc("participant_count", {
        p_session_id: sessionId,
      });
      if (cancelled) return;
      if (error) {
        setConnected(false);
        console.error(error);
        return;
      }
      setConnected(true);
      setCount(typeof data === "number" ? data : 0);
    };

    pull();
    const id = setInterval(pull, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [sessionId]);

  return { count, connected };
}
