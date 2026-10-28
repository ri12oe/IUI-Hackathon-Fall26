import { useState } from "react";
import { useNavigate } from "react-router";
import Logo from "../../components/Logo";
import { createSession } from "../../lib/session";
import "./Host.scss";

export default function HostSetup() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    setLoading(true);
    setError(null);
    try {
      const session = await createSession();
      navigate(`/host/${session.room_code}`);
    } catch (e) {
      setError((e as { message?: string }).message ?? "Couldn't start a session.");
      setLoading(false);
    }
  }

  return (
    <main className="host">
      <Logo size={40} />
      <button className="host__start" onClick={handleStart} disabled={loading}>
        {loading ? "Starting…" : "Start a session"}
      </button>
      {error && <p className="host__error">{error}</p>}
    </main>
  );
}