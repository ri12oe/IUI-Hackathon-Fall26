import type { ConfusionStats } from "../lib/confusion";
import "./ConfusionMeter.scss";

type Props = { stats: ConfusionStats; connected: boolean };

function levelFor(percent: number) {
  if (percent >= 35) return "high";
  if (percent >= 15) return "medium";
  return "low";
}

export default function ConfusionMeter({ stats, connected }: Props) {
  const level = levelFor(stats.percent);

  return (
    <section className={`meter meter--${level}`} aria-live="polite">
      <p className="meter__label">
        <span className={`meter__dot ${connected ? "is-live" : ""}`} />
        {connected ? "Live" : "Connecting…"}
      </p>

      <p className="meter__percent">{stats.percent}%</p>
      <p className="meter__caption">lost right now</p>

      <div className="meter__bar">
        <div className="meter__fill" style={{ width: `${stats.percent}%` }} />
      </div>

      <p className="meter__counts">
        {stats.lost} of {stats.active} {stats.active === 1 ? "student" : "students"}
      </p>
    </section>
  );
}