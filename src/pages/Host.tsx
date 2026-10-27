import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import ConfusionMeter from "../components/ConfusionMeter";
import { useLiveConfusion } from "../hooks/useLiveConfusion";
import { createSession, type Session } from "../lib/session.ts";
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
        setError((e as { message: string }).message ?? "An unknown error occurred");
    } finally {
        setLoading(false);
    }
  }
  
  const { stats, connected } = useLiveConfusion(session?.id);
  
  if (!session) {
    return (
        <main className="host">
            <h1>Confusion Heatmap</h1>
            <button className="host__start" onClick={handleStart} disabled={loading}>
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
      <p className="host__label">Or go to {new URL(joinUrl).host}/join and enter</p>
      <p className="host__code">{session.room_code}</p>
    </div>

    <ConfusionMeter stats={stats} connected={connected} />
  </main>
);
}