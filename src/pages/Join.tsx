import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { joinSession, type Session } from "../lib/session";
import { useSessionUpdates } from "../hooks/useSessionUpdates";
import StudentRoom from "../components/StudentRoom";
import Welcome from "../components/Welcome";
import SessionEnded from "../components/SessionEnded";
import Logo from "../components/Logo";
import "./Join.scss";

const WELCOMED_KEY = "muddy:welcomed";
function hasSeenWelcome() {
  try {
    return localStorage.getItem(WELCOMED_KEY) === "1";
  } catch {
    return false;
  }
}

export default function Join() {
  const [params, setParams] = useSearchParams();
  const [code, setCode] = useState(params.get("code")?.toUpperCase() ?? "");
  const [session, setSession] = useState<Session | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState(() => !hasSeenWelcome());
  const autoJoinTried = useRef(false);
  const [focused, setFocused] = useState(false);
  const [showScanHelp, setShowScanHelp] = useState(false);

  useSessionUpdates(session?.id, setSession);

  async function join(roomCode: string) {
    if (!/^[A-Z]{4}$/.test(roomCode)) {
      setError("Enter the 4-letter code.");
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

  // Auto-join when arriving from the QR code (?code=ABCD)
  useEffect(() => {
    const fromUrl = params.get("code");
    if (fromUrl && !autoJoinTried.current) {
      autoJoinTried.current = true;
      join(fromUrl.toUpperCase());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Joined: show the welcome once, then the room
  if (session && deviceId) {
    if (session.status === "ended") {
      return (
        <SessionEnded
          session={session}
          onDone={() => {
            setSession(null);
            setDeviceId(null);
            setCode("");
            setError(null);
            setParams({}, { replace: true }); // drop ?code=ABCD from the URL
          }}
        />
      );
    }
    if (showWelcome) {
      return (
        <Welcome
          session={session}
          onContinue={() => {
            try {
              localStorage.setItem(WELCOMED_KEY, "1");
            } catch {
              /* fine */
            }
            setShowWelcome(false);
          }}
        />
      );
    }
    return <StudentRoom session={session} deviceId={deviceId} />;
  }

  // Not joined yet: the join form (uses code, error and loading)
  // Arriving from the QR code: show a short "Joining" screen instead of the form
  if (loading && params.get("code")) {
    return (
      <main className="join join--loading">
        <Logo size={22} />
        <p>Joining {code}…</p>
      </main>
    );
  }

  function onCodeChange(value: string) {
    const next = value
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, 4);
    setCode(next);
    setError(null);
    if (next.length === 4 && !loading) join(next); // auto-join on the 4th letter
  }

  return (
    <main className="join">
      <header className="join__top">
        <Logo size={22} />
      </header>

      <section className="join__body">
        <h1>Join class</h1>
        <p className="join__lede">It's the 4 letters on the projector.</p>

        <form
          className="join__form"
          onSubmit={(e) => {
            e.preventDefault();
            join(code);
          }}
        >
          <label className="join__code">
            <span className="visually-hidden">Room code</span>
            <input
              value={code}
              onChange={(e) => onCodeChange(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              maxLength={4}
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              autoFocus
            />
            <span className="join__boxes" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={[
                    "join__box",
                    code[i] ? "is-filled" : "",
                    focused && i === Math.min(code.length, 3)
                      ? "is-active"
                      : "",
                  ].join(" ")}
                >
                  {code[i] ?? ""}
                </span>
              ))}
            </span>
          </label>

          {error && (
            <p className="join__error" role="alert">
              {error}
            </p>
          )}

          <button
            className="btn btn--primary join__submit"
            disabled={loading || code.length < 4}
          >
            {loading ? "Joining…" : "Join"}
          </button>
        </form>

        <div className="join__or">
          <span>or</span>
        </div>

        <button
          type="button"
          className="btn btn--secondary join__scan"
          onClick={() => setShowScanHelp((v) => !v)}
          aria-expanded={showScanHelp}
        >
          Scan QR code
        </button>
        {showScanHelp && (
          <p className="join__scanhelp">
            Open your phone's camera app and point it at the QR code on the
            projector. It opens this page with the code already filled in.
          </p>
        )}
      </section>

      <footer className="join__privacy">We never ask for your name.</footer>
    </main>
  );
}
