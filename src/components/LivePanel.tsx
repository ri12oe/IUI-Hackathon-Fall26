import type { ConfusionStats, SlideConfusion } from "../lib/confusion";
import { heatLevel } from "../lib/heat";
import "./LivePanel.scss";

type Props = {
  stats: ConfusionStats;
  connected: boolean;
  history: number[];
  bySlide: SlideConfusion[];
  currentSlide: number;
  threshold: number;
  alertsOn: boolean;
  onToggleAlerts: () => void;
  onSelectSlide: (slide: number) => void;
  onClose: () => void;
};

export default function LivePanel(p: Props) {
  const top = p.bySlide.slice(0, 5);
  const maxLost = top[0]?.lost ?? 1;

  return (
    <aside className="panel" aria-label="Live class panel">
      <header className="panel__head">
        <h2>Live</h2>
        <button className="panel__close" onClick={p.onClose} aria-label="Close panel">×</button>
      </header>

      <p className="panel__status">
        <span className={`panel__dot ${p.connected ? "is-live" : ""}`} />
        {p.connected ? "Connected" : "Connecting…"}
        <span className="panel__active">{p.stats.active} active</span>
      </p>

      <p className="panel__big">
        <strong className={p.stats.percent >= p.threshold ? "is-over" : ""}>{p.stats.percent}%</strong>
        <span>lost right now</span>
      </p>

      <section>
        <h3 className="panel__label">Last 5 minutes</h3>
        <div className="panel__spark" aria-label={`Recent confusion: ${p.history.join("%, ")}%`}>
          {p.history.map((v, i) => (
            <span
              key={i}
              style={{ height: `${Math.max(6, (v / 100) * 100)}%`, background: `var(--heat-${Math.max(1, heatLevel(v))})` }}
            />
          ))}
        </div>
      </section>

      <hr />

      <section className="panel__slides">
        <h3 className="panel__label">Confusing slides</h3>
        {top.length === 0 ? (
          <p className="panel__empty">Nobody has tapped yet.</p>
        ) : (
          <ol>
            {top.map(({ slide, lost }) => (
              <li key={slide}>
                <button
                  className={slide === p.currentSlide ? "is-current" : ""}
                  onClick={() => p.onSelectSlide(slide)}
                  title={`Go to slide ${slide}`}
                >
                  <span className={`panel__tile heat-${Math.max(1, Math.ceil((lost / maxLost) * 5))}`}>{slide}</span>
                  <span className="panel__slidetext">
                    Slide {slide}
                    <small>{lost} {lost === 1 ? "student" : "students"} lost</small>
                  </span>
                  <span className="panel__go" aria-hidden="true">›</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>

      <footer className="panel__foot">
        <span>
          Alerts
          <small>When {p.threshold}% are lost</small>
        </span>
        <button
          className={`switch ${p.alertsOn ? "is-on" : ""}`}
          role="switch"
          aria-checked={p.alertsOn}
          aria-label="Alerts"
          onClick={p.onToggleAlerts}
        >
          <span />
        </button>
      </footer>
    </aside>
  );
}