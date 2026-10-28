import Logo from "./Logo";
import type { Session } from "../lib/session";
import "./Welcome.scss";

type Props = { session: Session; onContinue: () => void };

const STEPS = [
  { icon: "hand", title: "Tap the button when you're lost.", body: "Even a little lost counts." },
  { icon: "eye", title: "Your instructor sees a count.", body: "Not who tapped." },
  { icon: "timer", title: "Taps clear after a minute.", body: "Tap again if you're still stuck." },
] as const;

const ICONS = {
  hand: "M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  timer: "M10 2h4M12 14l3-3M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16z",
};

export default function Welcome({ session, onContinue }: Props) {
  const course = [session.course, `room ${session.room_code}`].filter(Boolean).join(", ");

  return (
    <main className="welcome">
      <Logo size={20} />

      <h1>You're in.</h1>

      <div className="welcome__class">
        <small>{course}</small>
        <strong>{session.title ?? "Today's lecture"}</strong>
      </div>

      <h2>How it works</h2>
      <ul className="welcome__steps">
        {STEPS.map((s) => (
          <li key={s.icon}>
            <span className="welcome__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d={ICONS[s.icon]} /></svg>
            </span>
            <span>
              <strong>{s.title}</strong>
              <small>{s.body}</small>
            </span>
          </li>
        ))}
      </ul>

      <button className="btn btn--primary welcome__go" onClick={onContinue} autoFocus>
        Continue
      </button>
    </main>
  );
}