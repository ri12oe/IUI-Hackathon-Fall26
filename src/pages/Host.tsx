import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import ConfusionMeter from "../components/ConfusionMeter";
import { useLiveConfusion } from "../hooks/useLiveConfusion";
import {
  createSession,
  setCurrentSlide,
  type Session,
} from "../lib/session.ts";
import "./Host.scss";

export default function Host() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    setLoading(true);
    setError(null);
    try {
      setSession(await createSession());
    } catch (e) {
      setError(
        (e as { message: string }).message ?? "An unknown error occurred",
      );
    } finally {
      setLoading(false);
    }
  }

  const { stats, connected } = useLiveConfusion(session?.id);

  async function goTo(slide: number) {
    if (!session) return;
    const max = session.slide_count ?? Infinity;
    const next = Math.min(Math.max(1, slide), max);
    if (next === session.current_slide) return;

    const previous = session.current_slide;
    setSession({ ...session, current_slide: next }); // update the host screen right away
    try {
      await setCurrentSlide(session.id, next);
    } catch (e) {
      setSession((s) => (s ? { ...s, current_slide: previous } : s)); // undo on failure
      setError((e as { message?: string }).message ?? "Couldn't change slide.");
    }
  }

  // Arrow keys and presentation clickers (they send PageUp / PageDown)
  useEffect(() => {
    if (!session) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        goTo(session.current_slide + 1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        goTo(session.current_slide - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  if (!session) {
    return (
      <main className="host">
        <h1>Confusion Heatmap</h1>
        <button
          className="host__start"
          onClick={handleStart}
          disabled={loading}
        >
          {loading ? "Starting..." : "Start a session"}
        </button>
        {error && <p className="host__error">{error}</p>}
      </main>
    );
  }

  const joinUrl = `${window.location.origin}/join?code=${session.room_code}`;

  return (
    <main className="host host--live">
      <div className="host__join">
        <div className="host__qr">
          <QRCodeSVG value={joinUrl} size={240} marginSize={2} />
        </div>
        <p className="host__label">
          Or go to {new URL(joinUrl).host}/join and enter
        </p>
        <p className="host__code">{session.room_code}</p>
      </div>

      <section className="host__side">
        <ConfusionMeter stats={stats} connected={connected} />

        <div className="host__controls">
          <button
            onClick={() => goTo(session.current_slide - 1)}
            disabled={session.current_slide <= 1}
          >
            ← Prev
          </button>
          <span className="host__slide">
            Slide {session.current_slide}
            {session.slide_count ? ` / ${session.slide_count}` : ""}
          </span>
          <button onClick={() => goTo(session.current_slide + 1)}>
            Next →
          </button>
        </div>

        {error && <p className="host__error">{error}</p>}
      </section>
    </main>
  );
}
