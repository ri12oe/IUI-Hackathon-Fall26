import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import Logo from "../components/Logo";
import SlideViewer from "../components/SlideViewer";
import { getHostSession, type Session } from "../lib/session";
import { fetchAllEvents } from "../lib/events";
import { buildReport, type Report as ReportData } from "../lib/report";
import type { ConfusionEvent } from "../lib/confusion";
import { heatLevel } from "../lib/heat";
import "./Report.scss";

type Load =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "not-host" }
  | { kind: "error"; message: string }
  | { kind: "ready"; session: Session; events: ConfusionEvent[] };

const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const elapsed = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0")}`;

export default function Report() {
  const { code = "" } = useParams();
  const roomCode = code.toUpperCase();
  const navigate = useNavigate();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [preview, setPreview] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { session, isHost } = await getHostSession(roomCode);
        if (cancelled) return;
        if (!session) return setLoad({ kind: "missing" });
        if (!isHost) return setLoad({ kind: "not-host" });
        const events = await fetchAllEvents(session.id);
        if (!cancelled) setLoad({ kind: "ready", session, events });
      } catch (e) {
        if (!cancelled) setLoad({ kind: "error", message: (e as { message?: string }).message ?? "Couldn't load the report." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roomCode]);

  const report: ReportData | null = useMemo(
    () => (load.kind === "ready" ? buildReport(load.session, load.events) : null),
    [load]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPreview(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (load.kind === "loading") return <main className="report report--center"><p>Building the report…</p></main>;
  if (load.kind === "missing")
    return (
      <main className="report report--center">
        <Logo size={28} />
        <p>There's no session with the code {roomCode}.</p>
        <Link to="/host">Start a new session</Link>
      </main>
    );
  if (load.kind === "not-host")
    return (
      <main className="report report--center">
        <Logo size={28} />
        <p>Reports are only visible from the browser that ran the session.</p>
        <Link to={`/join?code=${roomCode}`}>See the student summary instead</Link>
      </main>
    );
  if (load.kind === "error" || !report)
    return <main className="report report--center"><p className="report__error">{load.kind === "error" ? load.message : "Something went wrong."}</p></main>;

  const { session } = load;
  const t = report.takeaway;
  const maxLost = report.slides[0]?.lost ?? 1;
  const date = new Date(report.start).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  const meta = [session.course, date, `${report.durationMin} min`, `${report.students} students`].filter(Boolean).join(", ");
  const axis = [0, 0.25, 0.5, 0.75, 1].map((f) => elapsed((report.end - report.start) * f));

  return (
    <main className="report">
      <header className="report__top">
        <Logo />
        <span className="report__crumb">Reports <span aria-hidden="true">›</span> {session.title ?? roomCode}</span>
        <button className="btn btn--primary report__new" onClick={() => navigate("/host")}>New session</button>
      </header>

      <div className="report__head">
        <p className="report__meta">{meta}</p>
        <h1>{session.title ?? `Session ${roomCode}`}</h1>
      </div>

      {/* Takeaway */}
      <section className="report__card report__takeaway">
        {t ? (
          <>
            <div className="report__takeaway-text">
              <span className="report__tag">Start here next time</span>
              <h2>Most of the room got lost on slide {t.slide}.</h2>
              <p>
                {t.lost} of {report.students} students tapped during slide {t.slide}, peaking at {t.peak}% around{" "}
                {clock(t.peakAt)}.{t.spillsInto ? ` It stayed high through slide ${t.spillsInto}.` : ""}
              </p>
              <div className="report__actions">
                {session.slides_url && (
                  <button className="btn btn--primary" onClick={() => setPreview(t.slide)}>Open slide {t.slide}</button>
                )}
                {session.slides_url && t.spillsInto && (
                  <button className="report__link" onClick={() => setPreview(t.spillsInto)}>See slide {t.spillsInto}</button>
                )}
              </div>
            </div>
            {session.slides_url && (
              <button className="report__hero-thumb" onClick={() => setPreview(t.slide)} aria-label={`Open slide ${t.slide}`}>
                <SlideViewer url={session.slides_url} page={t.slide} />
              </button>
            )}
          </>
        ) : (
          <div className="report__takeaway-text">
            <h2>Nobody tapped during this lecture.</h2>
            <p>{report.students} students joined. Either it all made sense, or nobody wanted to be first.</p>
          </div>
        )}
      </section>

      {/* Timeline */}
      <section className="report__card">
        <div className="report__card-head">
          <div>
            <h3>Over the lecture</h3>
            <p>30-second blocks, slide numbers underneath.</p>
          </div>
          <span className="report__legend" aria-hidden="true">
            Clear {[0, 1, 2, 3, 4, 5].map((i) => <i key={i} className={`heat-${i}`} />)} Muddy
          </span>
        </div>

        <div className="report__cells" role="img" aria-label={`Confusion over ${report.durationMin} minutes, peaking at ${report.peak?.percent ?? 0}%`}>
          {report.buckets.map((b) => (
            <span
              key={b.index}
              className={`heat-${heatLevel(b.percent)}`}
              title={`${clock(b.end)}: ${b.percent}% lost${b.slide ? `, slide ${b.slide}` : ""}`}
            />
          ))}
        </div>

        <div className="report__lanes" aria-hidden="true">
          {report.lanes.map((l) => (
            <span
              key={`${l.slide}-${l.from}`}
              style={{ flexGrow: l.length }}
              className={t && l.slide === t.slide ? "is-hot" : ""}
            >
              {l.length >= 2 ? l.slide : ""}
            </span>
          ))}
        </div>

        <div className="report__axis" aria-hidden="true">
          {axis.map((a, i) => <span key={i}>{a}</span>)}
        </div>
      </section>

      <div className="report__bottom">
        {/* Ranked slides */}
        <section className="report__card report__ranked">
          <div className="report__card-head">
            <h3>By slide</h3>
            <p>
              {report.slides.length}
              {session.slide_count ? ` of ${session.slide_count}` : ""} slides had taps
            </p>
          </div>

          {report.slides.length === 0 ? (
            <p className="report__muted">No slides had taps.</p>
          ) : (
            <ol>
              {report.slides.slice(0, 8).map((s) => (
                <li key={s.slide}>
                  <button onClick={() => session.slides_url && setPreview(s.slide)} disabled={!session.slides_url}>
                    {session.slides_url ? (
                      <span className="report__thumb"><SlideViewer url={session.slides_url} page={s.slide} /></span>
                    ) : (
                      <span className={`report__tile heat-${Math.max(1, Math.ceil((s.lost / maxLost) * 5))}`}>{s.slide}</span>
                    )}
                    <span className="report__rowtext">
                      <strong>Slide {s.slide}</strong>
                      <small>Peak {s.peak}% lost</small>
                    </span>
                    <span className="report__bar">
                      <span
                        className={`heat-${Math.max(1, Math.ceil((s.lost / maxLost) * 5))}`}
                        style={{ width: `${(s.lost / maxLost) * 100}%` }}
                      />
                    </span>
                    <span className="report__count">{s.lost}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* Summary */}
        <section className="report__card report__summary">
          <h3>Summary</h3>
          <dl>
            <div><dt>Students joined</dt><dd>{report.students}</dd></div>
            <div><dt>Taps</dt><dd>{report.lostTaps} ({report.lostStudents} students)</dd></div>
            <div>
              <dt>Slides with taps</dt>
              <dd>{report.slides.length}{session.slide_count ? ` of ${session.slide_count}` : ""}</dd>
            </div>
            <div>
              <dt>Peak</dt>
              <dd className="is-hot">
                {report.peak?.percent ?? 0}%{report.peak?.slide ? `, slide ${report.peak.slide}` : ""}
              </dd>
            </div>
            <div><dt>Length</dt><dd>{report.durationMin} min</dd></div>
          </dl>
        </section>
      </div>

      {preview !== null && session.slides_url && (
        <div className="report__modal" role="dialog" aria-modal="true" aria-label={`Slide ${preview}`} onClick={() => setPreview(null)}>
          <div className="report__modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="report__modal-head">
              <strong>Slide {preview}</strong>
              <button onClick={() => setPreview(null)} aria-label="Close">×</button>
            </div>
            <div className="report__modal-slide">
              <SlideViewer url={session.slides_url} page={preview} fit="contain" />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}