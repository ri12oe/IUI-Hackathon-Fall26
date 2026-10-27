import { useEffect, type Dispatch, type SetStateAction } from "react";
import { supabase } from "../lib/supabase";
import { SESSION_COLUMNS, type Session } from "../lib/session";

export function useSessionUpdates(
  sessionId: string | undefined,
  setSession: Dispatch<SetStateAction<Session | null>>,
) {
  useEffect(() => {
    if (!sessionId) return;

    // Load the latest row (on first connect and after reconnects)
    const refresh = async () => {
      const { data } = await supabase
        .from("sessions")
        .select(SESSION_COLUMNS)
        .eq("id", sessionId)
        .maybeSingle();
      if (data)
        setSession((prev) => (prev ? { ...prev, ...(data as Session) } : prev));
    };

    const channel = supabase
      .channel(`session:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sessions",
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          const row = payload.new as Partial<Session>;
          setSession((prev) => (prev ? { ...prev, ...row } : prev));
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") refresh();
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, setSession]);
}
