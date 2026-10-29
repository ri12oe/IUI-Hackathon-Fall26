import { useEffect, useState } from "react";
import Logo from "./Logo";
import SlideViewer from "./SlideViewer";
import { fetchLostEvents } from "../lib/events";
import { confusionBySlide, type SlideConfusion } from "../lib/confusion";
import type { Session } from "../lib/session";
import "./SessionEnded.scss";

type Props = { session: Session; onDone: () => void };

export default function SessionEnded({ session, onDone }: Props) {
  const [top, setTop] = useState<SlideConfusion[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    if (!session.share_with_students) return;
    let cancelled = false;
    fetchLostEvents(session.id)
      .then(
        (events) => !cancelled && setTop(confusionBySlide(events).slice(0, 3)),
      )
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [session.id, session.share_with_students]);

  return (
    <main className="ended">
      <Logo size={20} />

      <h1>That's class.</h1>

      {!session.share_with_students ? (
        <p className="ended__lede">
          Thanks for following along. You can close this page.
        </p>
      ) : (
        <>
          <p className="ended__lede">
            The slides most people got stuck on today. Probably worth a look
            before next lecture.
          </p>

          {failed && (
            <p className="ended__muted">
              Couldn't load today's slides. Try refreshing.
            </p>
          )}
          {!failed && top === null && <p className="ended__muted">Loading…</p>}
          {top?.length === 0 && (
            <p className="ended__muted">Nobody tapped today. Nice.</p>
          )}

          {top && top.length > 0 && (
            <>
              <h2>Muddiest slides today</h2>
              <ol className="ended__list">
                {top.map(({ slide, lost }, i) => (
                  <li key={slide}>
                    <button
                      className={`ended__row ${open === slide ? "is-open" : ""}`}
                      onClick={() => setOpen(open === slide ? null : slide)}
                      aria-expanded={open === slide}
                    >
                      <span className={`ended__tile heat-${5 - i}`}>
                        {slide}
                      </span>
                      <span className="ended__text">
                        <strong>Slide {slide}</strong>
                        <small>
                          {lost} {lost === 1 ? "student" : "students"} got lost
                          here
                        </small>
                      </span>
                      {session.slides_url && (
                        <span className="ended__chev" aria-hidden="true">
                          ›
                        </span>
                      )}
                    </button>

                    {open === slide && session.slides_url && (
                      <div className="ended__preview">
                        <SlideViewer url={session.slides_url} page={slide} />
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </>
          )}
        </>
      )}

      <button className="btn btn--secondary ended__done" onClick={onDone}>
        Done
      </button>
    </main>
  );
}