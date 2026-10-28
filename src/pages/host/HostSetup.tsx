import { useEffect, useState } from "react";
import {
  createSession,
  getMyActiveSession,
  type Session,
} from "../../lib/session";
import { useNavigate } from "react-router";
import Logo from "../../components/Logo";
import "./Host.scss";

export default function HostSetup() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [active, setActive] = useState<Session | null>(null);

  useEffect(() => {
    getMyActiveSession()
      .then(setActive)
      .catch(() => {});
  }, []);

  async function handleStart() {
    setLoading(true);
    setError(null);
    try {
      const session = await createSession();
      navigate(`/host/${session.room_code}`);
    } catch (e) {
      setError(
        (e as { message?: string }).message ?? "Couldn't start a session.",
      );
      setLoading(false);
    }
  }

  return (
    <main className="host">
      <Logo size={40} />
      {active && (
        <div className="host__resume">
          <p>
            You have a session in progress: <strong>{active.room_code}</strong>
            {active.title ? `, ${active.title}` : ""}
          </p>
          <button onClick={() => navigate(`/host/${active.room_code}`)}>
            Resume
          </button>
        </div>
      )}
      <button className="host__start" onClick={handleStart} disabled={loading}>
        {loading ? "Starting…" : "Start a session"}
      </button>
      {error && <p className="host__error">{error}</p>}
    </main>
  );
}
