import type { ConfusionStats } from "../lib/confusion";
import { heatLevel } from "../lib/heat";
import "./PresenterBar.scss";

type Props = {
  current: number;
  total: number | null;
  stats: ConfusionStats;
  threshold: number;
  panelOpen: boolean;
  onPrev: () => void;
  onNext: () => void;
  onShowCode: () => void;
  onTogglePanel: () => void;
};

const Chevron = ({ dir }: { dir: "left" | "right" }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d={dir === "left" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
  </svg>
);

export default function PresenterBar(p: Props) {
  const atStart = p.current <= 1;
  const atEnd = p.total !== null && p.current >= p.total;
  const over = p.stats.percent >= p.threshold;

  return (
    <nav className="pbar" aria-label="Presenter controls">
      <div className="pbar__nav">
        <button className="pbar__round" onClick={p.onPrev} disabled={atStart} aria-label="Previous slide">
          <Chevron dir="left" />
        </button>
        <span className="pbar__count">
          {p.current}
          {p.total ? ` / ${p.total}` : ""}
        </span>
        <button className="pbar__round" onClick={p.onNext} disabled={atEnd} aria-label="Next slide">
          <Chevron dir="right" />
        </button>
      </div>

      <span className="pbar__divider" />

      <div className="pbar__gauge" aria-live="polite">
        <span className="pbar__label">Lost now</span>
        <span className="pbar__track">
          <span
            className="pbar__fill"
            style={{
              width: `${p.stats.percent}%`,
              background: over ? "var(--accent-strong)" : `var(--heat-${heatLevel(p.stats.percent)})`,
            }}
          />
        </span>
        <strong className={`pbar__pct ${over ? "is-over" : ""}`}>{p.stats.percent}%</strong>
        <span className="pbar__of">
          {p.stats.lost} of {p.stats.active}
        </span>
      </div>

      <span className="pbar__divider" />

      <div className="pbar__actions">
        <button className="btn btn--secondary" onClick={p.onShowCode}>Code</button>
        <button
          className={`btn ${p.panelOpen ? "btn--primary" : "btn--secondary"}`}
          onClick={p.onTogglePanel}
          aria-pressed={p.panelOpen}
        >
          {p.panelOpen ? "Hide panel" : "Live panel"}
        </button>
      </div>
    </nav>
  );
}