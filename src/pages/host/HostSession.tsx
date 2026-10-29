import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router";
import Logo from "../../components/Logo";
import { getHostSession, type Session } from "../../lib/session";
import { useSessionUpdates } from "../../hooks/useSessionUpdates";
import Lobby from "./Lobby";
import Presenting from "./Presenting";
import "./Host.scss";

type Load =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "not-host" }
  | { kind: "error"; message: string }
  | { kind: "ready" };

export default function HostSession() {
  const { code = "" } = useParams();
  const roomCode = code.toUpperCase();
  const [session, setSession] = useState<Session | null>(null);
  const [result, setResult] = useState<{ roomCode: string; load: Load } | null>(
    null,
  );
  // A result for a previous room code counts as still loading
  const load: Load =
    result?.roomCode === roomCode ? result.load : { kind: "loading" };

  useEffect(() => {
    let cancelled = false;
    const finish = (next: Load) =>
      !cancelled && setResult({ roomCode, load: next });
    getHostSession(roomCode)
      .then(({ session, isHost }) => {
        if (cancelled) return;
        if (!session) return finish({ kind: "missing" });
        if (!isHost) return finish({ kind: "not-host" });
        setSession(session);
        finish({ kind: "ready" });
      })
      .catch((e) =>
        finish({
          kind: "error",
          message: e.message ?? "Couldn't load the session.",
        }),
      );
    return () => {
      cancelled = true;
    };
  }, [roomCode]);

  // Only subscribe once we know this browser is the host
  useSessionUpdates(
    load.kind === "ready" ? session?.id : undefined,
    setSession,
    true,
  );
  if (load.kind === "loading") {
    return (
      <main className="host">
        <p>Loading…</p>
      </main>
    );
  }

  if (load.kind === "missing") {
    return (
      <main className="host">
        <Logo size={28} />
        <p>There's no session with the code {roomCode}.</p>
        <Link to="/host">Start a new session</Link>
      </main>
    );
  }

  if (load.kind === "not-host") {
    return (
      <main className="host">
        <Logo size={28} />
        <p>Session {roomCode} is being run from a different browser.</p>
        <p className="host__hint">
          Only the browser that started it can control it. If you're a student,
          join instead.
        </p>
        <Link to={`/join?code=${roomCode}`}>Join {roomCode} as a student</Link>
      </main>
    );
  }

  if (load.kind === "error" || !session) {
    return (
      <main className="host">
        <p className="host__error">
          {load.kind === "error" ? load.message : "Something went wrong."}
        </p>
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
