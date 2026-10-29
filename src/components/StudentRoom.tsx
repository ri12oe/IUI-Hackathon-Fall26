import { useEffect, useRef, useState } from "react";
import { sendEvent, type EventType } from "../lib/events";
import { LOST_WINDOW_MS } from "../lib/confusion";
import type { Session } from "../lib/session";
import SlideViewer from "./SlideViewer";
import { useWakeLock } from "../hooks/useWakeLock";
import "./StudentRoom.scss";

const HEARTBEAT_MS = 30_000;
const TAP_COOLDOWN_MS = 3_000;

type Props = { session: Session; deviceId: string };

function formatLeft(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function StudentRoom({ session, deviceId }: Props) {
  const [lostUntil, setLostUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);

  const slideRef = useRef(session.current_slide);
  useEffect(() => {
    slideRef.current = session.current_slide;
  }, [session.current_slide]);
  const lastTapRef = useRef(0);

  const waiting = session.status === "lobby";

  const { active: screenAwake } = useWakeLock(session.status !== "ended");

  async function send(type: EventType) {
    try {
      await sendEvent(session.id, deviceId, type, slideRef.current);
      setError(null);
    } catch {
      setError("Couldn't send. Check your connection and tap again.");
    }
  }

  // Heartbeat: on join, every 30s, and when the tab comes back into view
  useEffect(() => {
    const beat = () => sendEvent(session.id, deviceId, "heartbeat", slideRef.current).catch(() => {});
    beat();
    const id = setInterval(beat, HEARTBEAT_MS);
    const onVisible = () => document.visibilityState === "visible" && beat();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [session.id, deviceId]);

  // Countdown while marked lost
  useEffect(() => {
    if (lostUntil === null) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= lostUntil) setLostUntil(null);
    }, 250);
    return () => clearInterval(id);
  }, [lostUntil]);

  function handleLost() {
    if (waiting) return;
    const t = Date.now();
    if (t - lastTapRef.current < TAP_COOLDOWN_MS) return;
    lastTapRef.current = t;
    setNow(t);
    setLostUntil(t + LOST_WINDOW_MS);
    navigator.vibrate?.(30);
    send("lost");
  }

  function handleGotIt() {
    setLostUntil(null);
    send("got_it");
  }

  const isLost = lostUntil !== null && now < lostUntil;
  const left = isLost ? lostUntil - now : 0;

  return (
    <main className={`room ${isLost ? "room--lost" : ""}`}>
      <header className="room__header">
        <span className="room__chip">
          <i aria-hidden="true" /> Room {session.room_code}
        </span>
        {screenAwake && <span className="room__awake">Screen stays on</span>}
        {!waiting && (
          <span className="room__slide-num">
            {session.current_slide}
            {session.slide_count ? ` / ${session.slide_count}` : ""}
          </span>
        )}
      </header>

      {session.slides_url && !waiting && (
        <div className="room__slide">
          <SlideViewer url={session.slides_url} page={session.current_slide} />
        </div>
      )}

      <section className="room__middle" aria-live="polite">
        {waiting ? (
          <p className="room__waiting">
            <strong>Class hasn't started yet.</strong>
            Leave this open. The button turns on when your instructor starts.
          </p>
        ) : isLost ? (
          <div className="room__sent">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
            <span>
              <strong>Sent.</strong>
              Your instructor sees the count go up.
            </span>
          </div>
        ) : (
          <p className="room__hint">Nothing to do unless you're lost.</p>
        )}
        {error && <p className="room__error">{error}</p>}
      </section>

      <footer className="room__bottom">
        {isLost && (
          <button className="btn btn--secondary room__gotit" onClick={handleGotIt}>
            Got it now
          </button>
        )}

        <button
          className="room__lost"
          onClick={handleLost}
          disabled={waiting}
          aria-pressed={isLost}
        >
          <span className="room__lost-label">
            {waiting ? "Waiting to start" : isLost ? "Marked lost" : "I'm lost"}
          </span>
          {isLost ? (
            <>
              <span className="room__timer" aria-hidden="true">
                <span style={{ width: `${(left / LOST_WINDOW_MS) * 100}%` }} />
              </span>
              <small>clears in {formatLeft(left)}</small>
            </>
          ) : (
            <small>{waiting ? "you're connected" : "anonymous"}</small>
          )}
        </button>
      </footer>
    </main>
  );
}