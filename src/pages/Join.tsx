import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { joinSession, type Session } from "../lib/session";
import StudentRoom from "../components/StudentRoom";
import "./Join.scss";

export default function Join() {
  const [params, setParams] = useSearchParams();
  const [code, setCode] = useState(params.get("code")?.toUpperCase() ?? "");
  const [session, setSession] = useState<Session | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoJoinTried = useRef(false);

  async function join(roomCode: string) {
    if (!/^[A-Z]{4}$/.test(roomCode)) {
      setError("Enter the 4-letter room code.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await joinSession(roomCode);
      setSession(result.session);
      setDeviceId(result.deviceId);
      setParams({ code: roomCode }, { replace: true });
    } catch (e) {
      setError((e as { message?: string }).message ?? "Couldn't join.");
    } finally {
      setLoading(false);
    }
  }
  // Auto-join when arriving from the QR code
  useEffect(() => {
    const fromUrl = params.get("code");
    if (fromUrl && !autoJoinTried.current) {
      autoJoinTried.current = true;
      join(fromUrl.toUpperCase());
    }
  }, []);

  if (session && deviceId) {
    return <StudentRoom session={session} deviceId={deviceId} />;
  }
  return (
    <main className="join">
      <h1>Join a session</h1>
      <form
        className="join__form"
        onSubmit={(e) => {
          e.preventDefault();
          join(code);
        }}
      >
        <input
          className="join__input"
          value={code}
          onChange={(e) =>
            setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))
          }
          maxLength={4}
          placeholder="ABCD"
          autoCapitalize="characters"
          autoComplete="off"
          aria-label="Room code"
        />
        <button className="join__button" disabled={loading}>
          {loading ? "Joining..." : "Join"}
        </button>
        {error && <p className="join__error">{error}</p>}
      </form>
    </main>
  );
}
