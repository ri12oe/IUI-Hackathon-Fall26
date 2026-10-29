import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { QRCodeSVG } from "qrcode.react";
import Logo from "../../components/Logo";
import { useLiveConfusion } from "../../hooks/useLiveConfusion";
import { updateSession, type Session } from "../../lib/session";
import { useLocation } from "react-router";
import "./Lobby.scss";

type Props = {
  session: Session;
  setSession: Dispatch<SetStateAction<Session | null>>;
};

const MAX_DOTS = 14;

export default function Lobby({ session, setSession }: Props) {
  const { stats, connected } = useLiveConfusion(session.id);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startingRef = useRef(false);

  const baseUrl = import.meta.env.VITE_PUBLIC_URL ?? window.location.origin;
  const joinUrl = `${baseUrl}/join?code=${session.room_code}`;
  const shortUrl = `${new URL(baseUrl).host}/join`;
  const joined = stats.active;
  const notice = (useLocation().state as { notice?: string } | null)?.notice;

  async function start() {
    if (startingRef.current) return; // ignore double clicks and repeated key presses
    startingRef.current = true;
    setStarting(true);
    setError(null);
    try {
      setSession(
        await updateSession(session.id, {
          status: "live",
          presenting_started_at: new Date().toISOString(),
        }),
      );
    } catch (e) {
      setError(
        (e as { message?: string }).message ?? "Couldn't start the session.",
      );
      startingRef.current = false;
      setStarting(false);
    }
  }

  // A presentation clicker (or → / Enter) starts the session
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowRight", "PageDown", "Enter"].includes(e.key)) {
        e.preventDefault();
        start();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }

  const subtitle = [session.course, session.title].filter(Boolean).join(", ");

  return (
    <main className="lobby">
      <header className="lobby__top">
        <Logo />
        {subtitle && <span className="lobby__subtitle">{subtitle}</span>}
        <button className="lobby__ghost" onClick={toggleFullscreen}>
          Full screen
        </button>
      </header>
      <section className="lobby__main">
        <div className="lobby__join">
          <h1 className="lobby__title">
            Join the{" "}
            <span className="lobby__underlined">
              class
              <svg
                viewBox="0 0 200 18"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path
                  d="M3 11 C 25 4, 48 15, 76 9 S 124 4, 148 10 S 180 13, 197 6"
                  stroke="var(--accent-heat)"
                  strokeWidth="5"
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>
            </span>
          </h1>

          <ol className="lobby__steps">
            <li>
              <span>1</span>Scan the QR code, or go to{" "}
              <strong>{shortUrl}</strong>
            </li>
            <li>
              <span>2</span>Enter this code
            </li>
          </ol>

          <div
            className="lobby__code"
            aria-label={`Room code ${session.room_code.split("").join(" ")}`}
          >
            {session.room_code.split("").map((ch, i) => (
              <span key={i} aria-hidden="true">
                {ch}
              </span>
            ))}
          </div>
        </div>

        <figure className="lobby__qr">
          <QRCodeSVG value={joinUrl} size={320} marginSize={1} />
          <figcaption>or scan this</figcaption>
        </figure>
      </section>
      {notice && (
        <p className="lobby__error" role="alert">
          {notice}
        </p>
      )}{" "}


      <footer className="lobby__bar">
        <span
          className={`lobby__live ${connected ? "is-live" : ""}`}
          aria-hidden="true"
        />
        <strong className="lobby__count" aria-live="polite">
          {joined} {joined === 1 ? "student" : "students"} joined
        </strong>

        <span className="lobby__dots" aria-hidden="true">
          {Array.from({ length: Math.min(joined, MAX_DOTS) }, (_, i) => (
            <i key={i} className={`heat-${(i % 3) + 1}`} />
          ))}
          {joined > MAX_DOTS && <em>+{joined - MAX_DOTS}</em>}
        </span>

        <span className="lobby__hint">
          {joined === 0
            ? "Waiting for the first phone…"
            : "Start whenever you're ready"}
        </span>

        <button
          className="btn btn--primary lobby__start"
          onClick={start}
          disabled={starting}
        >
          {starting ? "Starting…" : "Start"}
        </button>
      </footer>
      {error && (
        <p className="lobby__error" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
