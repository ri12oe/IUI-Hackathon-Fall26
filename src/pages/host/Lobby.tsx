import { useState, type Dispatch, type SetStateAction } from "react";
import { QRCodeSVG } from "qrcode.react";
import Logo from "../../components/Logo";
import { updateSession, type Session } from "../../lib/session";

type Props = { session: Session; setSession: Dispatch<SetStateAction<Session | null>> };

export default function Lobby({ session, setSession }: Props) {
  const [error, setError] = useState<string | null>(null);
  const baseUrl = import.meta.env.VITE_PUBLIC_URL ?? window.location.origin;
  const joinUrl = `${baseUrl}/join?code=${session.room_code}`;

  async function start() {
    try {
      setSession(
        await updateSession(session.id, {
          status: "live",
          presenting_started_at: new Date().toISOString(),
        })
      );
    } catch (e) {
      setError((e as { message?: string }).message ?? "Couldn't start.");
    }
  }

  return (
    <main className="host">
      <Logo />
      <h1>Join the class</h1>
      <div className="host__qr">
        <QRCodeSVG value={joinUrl} size={240} marginSize={2} />
      </div>
      <p className="host__code">{session.room_code}</p>
      <button className="host__start" onClick={start}>Start</button>
      {error && <p className="host__error">{error}</p>}
    </main>
  );
}