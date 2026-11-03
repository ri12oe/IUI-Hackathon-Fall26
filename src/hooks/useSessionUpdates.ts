import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { supabase } from "../lib/supabase";
import {
  attachSlideUrl,
  SESSION_COLUMNS,
  signedSlideUrl,
  type Session,
} from "../lib/session";

// Realtime delivers the whole row, including host_id and a null slides_url.
// Keep the signed URL unless the file itself changed.
function mergeSession(prev: Session, row: Partial<Session>, ignoreSlide: boolean): Session {
  const pathChanged = row.slides_path != null && row.slides_path !== prev.slides_path;
  const next: Session = { ...prev, ...row };
  if (ignoreSlide) next.current_slide = prev.current_slide;
  if (!row.slides_url && !pathChanged) next.slides_url = prev.slides_url;
  if (pathChanged && !row.slides_url) next.slides_url = null;
  return next;
}

export function useSessionUpdates(
  sessionId: string | undefined,
  setSession: Dispatch<SetStateAction<Session | null>>,
  ignoreSlide = false, // the host already knows its slide; skip echoes of its own changes
) {
  const signedPath = useRef<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    signedPath.current = null;

    const apply = (row: Partial<Session>) => {
      setSession((prev) => (prev ? mergeSession(prev, row, ignoreSlide) : prev));
    };

    const sign = (path: string) => {
      if (signedPath.current === path) return;
      signedPath.current = path;
      signedSlideUrl(path).then((url) => {
        if (cancelled || !url) return;
        setSession((prev) =>
          prev && prev.slides_path === path ? { ...prev, slides_url: url } : prev,
        );
      });
    };

    const refresh = async () => {
      const { data } = await supabase
        .from("sessions")
        .select(SESSION_COLUMNS)
        .eq("id", sessionId)
        .maybeSingle();
      if (!data || cancelled) return;
      const withUrl = await attachSlideUrl(data as Session);
      if (cancelled) return;
      if (withUrl.slides_path) signedPath.current = withUrl.slides_path;
      apply(withUrl);
    };

    const channel = supabase
      .channel(`session:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${sessionId}` },
        (payload) => {
          const raw = { ...(payload.new as Record<string, unknown>) };
          delete raw.host_id;
          const row = raw as Partial<Session>;
          apply(row);
          if (row.slides_path && row.slides_path !== signedPath.current) sign(row.slides_path);
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") refresh();
      });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [sessionId, setSession, ignoreSlide]);
}
