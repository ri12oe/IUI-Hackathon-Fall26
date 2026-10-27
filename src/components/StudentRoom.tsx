import { useEffect, useRef, useState } from "react";
import { sendEvent, type EventType } from "../lib/events";
import type { Session } from "../lib/session";
import "./StudentRoom.scss";

const LOST_WINDOW_MS = 60_000; // a "lost" tap counts for 60s
const HEARTBEAT_MS = 30_000; // "still here" ping every 30s
const TAP_COOLDOWN_MS = 3_000; // ignore rapid repeat taps

type Props = { session: Session; deviceId: string};

export default function StudentRoom({ session, deviceId }: Props) {
    const [lostUntil, setLostUntil] = useState<number | null>(null);
    const [now, setNow] = useState(0);
    const [error, setError] = useState<string | null>(null);

    const lastTapRef = useRef(0);

    async function send(type: EventType) {
        try {
            await sendEvent(session.id, deviceId, type, session.current_slide);
            setError(null);
        } catch (e) {
            setError((e as { message?: string }).message ?? "Couldn't send. Check your connection.");
        }
    }

    // Heartbeat: once on join, every 30s, and whenever the tab comes back into view
    useEffect(() => {
        const beat = () => 
            sendEvent(session.id, deviceId, "heartbeat", session.current_slide).catch(() => {});
        beat();
        const id = setInterval(beat, HEARTBEAT_MS);
        const onVisible = () => {
            if (document.visibilityState === "visible") beat();
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            clearInterval(id);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [session.id, session.current_slide, deviceId]);

    // Countdown while "lost" is active; resets itself after 60s
    useEffect(() => {
        if (lostUntil == null) return;
        const id = setInterval(() => {
            const t = Date.now();
            setNow(t);
            if (t >= lostUntil) setLostUntil(null);
        }, 1000);
        return () => clearInterval(id);
    }, [lostUntil]);

    function handleLost() {
        const t = Date.now();
        if (t - lastTapRef.current < TAP_COOLDOWN_MS) return;
        lastTapRef.current = t;
        setNow(t);
        setLostUntil(t + LOST_WINDOW_MS); // update the screen right away
        navigator.vibrate?.(30); // small buzz on Andriod; iPhones ignore it
        send("lost");
    }

    function handleGotIt() {
        setLostUntil(null);
        send("got_it");
    }

    const isLost = lostUntil !== null && now < lostUntil;
    const secondsLeft = isLost ? Math.ceil((lostUntil - now) / 1000) : 0;

    return (
        <main className="room">
            <header className="room__header">
                <span>Room {session.room_code}</span>
                <span>Slide {session.current_slide}</span>
            </header>
            <button
              className={`room__lost ${isLost ? "is-active" : ""}`}
              onClick={handleLost}
              aria-pressed={isLost}
            >
              {isLost ? "Marked lost" : "I'm lost"}
            </button>
            <p className="room__status">
                {isLost
                    ? `Your signal fades in ${secondsLeft}s. Tap again if you're still lost.`
                    : "Tap anytime. It's anonymous."
                }
            </p>
            {isLost && (
                <button className="room__gotit" onClick={handleGotIt}>Got it now</button>
            )}
            {error && <p className="room__error">{error}</p>}
        </main>
    );
}