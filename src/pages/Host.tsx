import { useState, useEffect, type ChangeEvent } from "react";
import SlideViewer from "../components/SlideViewer";
import { uploadSlides } from "../lib/slides";
import { QRCodeSVG } from "qrcode.react";
import ConfusionMeter from "../components/ConfusionMeter";
import { useLiveConfusion } from "../hooks/useLiveConfusion";
import SlideBreakdown from "../components/SlideBreakdown";
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
  const [uploading, setUploading] = useState(false);

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

  const { stats, bySlide, connected } = useLiveConfusion(session?.id);

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

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !session) return;
    setUploading(true);
    setError(null);
    try {
      setSession(await uploadSlides(session.id, file));
    } catch (err) {
      setError((err as { message?: string }).message ?? "Upload failed.");
    } finally {
      setUploading(false);
      e.target.value = ""; // lets you pick the same file again
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
      <section className="host__stage">
        {session.slides_url ? (
          <SlideViewer url={session.slides_url} page={session.current_slide} />
        ) : (
          <label className="host__upload">
            <input
              type="file"
              accept="application/pdf"
              onChange={handleFile}
              disabled={uploading}
              hidden
            />
            <span>{uploading ? "Uploading…" : "Upload slides (PDF)"}</span>
            <small>Or skip this and present with Prev / Next</small>
          </label>
        )}
      </section>

      <aside className="host__side">
        <div className="host__join">
          <div className="host__qr">
            <QRCodeSVG value={joinUrl} size={160} marginSize={2} />
          </div>
          <p className="host__label">{new URL(joinUrl).host}/join</p>
          <p className="host__code">{session.room_code}</p>
        </div>

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
          <button
            onClick={() => goTo(session.current_slide + 1)}
            disabled={
              session.slide_count !== null &&
              session.current_slide >= session.slide_count
            }
          >
            Next →
          </button>
        </div>

        <SlideBreakdown
          items={bySlide}
          currentSlide={session.current_slide}
          onSelect={goTo}
        />

        {error && <p className="host__error">{error}</p>}
      </aside>
    </main>
  );
}
