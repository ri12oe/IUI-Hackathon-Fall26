import { useEffect, type Dispatch, type SetStateAction } from "react";
import { supabase } from "../lib/supabase";
import { SESSION_COLUMNS, type Session } from "../lib/session";

export function useSessionUpdates(
  sessionId: string | undefined,
  setSession: Dispatch<SetStateAction<Session | null>>,
  ignoreSlide = false, // the host already knows its slide; skip echoes of its own changes
) {
  useEffect(() => {
    if (!sessionId) return;

    const apply = (row: Partial<Session>) => {
      const next = { ...row };
      if (ignoreSlide) delete next.current_slide;
      setSession((prev) => (prev ? { ...prev, ...next } : prev));
    };

    const refresh = async () => {
      const { data } = await supabase
        .from("sessions")
        .select(SESSION_COLUMNS)
        .eq("id", sessionId)
        .maybeSingle();
      if (data) apply(data as Session);
    };

    const channel = supabase
      .channel(`session:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${sessionId}` },
        (payload) => apply(payload.new as Partial<Session>),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") refresh();
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, setSession, ignoreSlide]);
}
