import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router";
import { getSessionByCode, type Session } from "../../lib/session";
import { useSessionUpdates } from "../../hooks/useSessionUpdates";
import Lobby from "./Lobby";
import Presenting from "./Presenting";
import "./Host.scss";

export default function HostSession() {
  const { code = "" } = useParams();
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSessionByCode(code)
      .then((s) => {
        if (cancelled) return;
        if (s) setSession(s);
        else setError(`No session with the code ${code.toUpperCase()}.`);
      })
      .catch((e) => !cancelled && setError(e.message ?? "Couldn't load the session."));
    return () => {
      cancelled = true;
    };
  }, [code]);

  // Keep the host in sync too (e.g. status changed from another tab)
  useSessionUpdates(session?.id, setSession);

  if (error) {
    return (
      <main className="host">
        <p className="host__error">{error}</p>
      </main>
    );
  }
  if (!session) {
    return (
      <main className="host">
        <p>Loading…</p>
      </main>
    );
  }

  switch (session.status) {
    case "lobby":
      return <Lobby session={session} setSession={setSession} />;
    case "live":
      return <Presenting session={session} setSession={setSession} />;
    case "ended":
      return <Navigate to={`/report/${session.room_code}`} replace />;
  }
}