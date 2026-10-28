import { useMemo, useState } from "react";
import type { ConfusionStats } from "../lib/confusion";

export const ALERT_MIN_LOST = 2; // ignore tiny rooms (1 of 1 = 100%)

export type ConfusionAlert = ConfusionStats & { slide: number };

export function useThresholdAlert(
  stats: ConfusionStats,
  currentSlide: number,
  onPercent = 35 // the session's alert_threshold (25, 35 or 50)
) {
  // Clear the alert 10 points below the trigger, so it doesn't flicker on and off
  const offPercent = Math.max(5, onPercent - 10);

  const [alertSlide, setAlertSlide] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const high = stats.percent >= onPercent && stats.lost >= ALERT_MIN_LOST;

  // Derived during render (no effect): adjust state only when the transition actually happens
  if (stats.percent < offPercent) {
    // Confusion has dropped: clear the alert and allow it to fire again later
    if (alertSlide !== null) setAlertSlide(null);
    if (dismissed) setDismissed(false);
  } else if (alertSlide === null && high && !dismissed) {
    setAlertSlide(currentSlide); // new alert, tied to the slide it started on
  }

  // Already showing: the numbers stay live because they come straight from stats
  const alert = useMemo<ConfusionAlert | null>(
    () => (alertSlide === null ? null : { ...stats, slide: alertSlide }),
    [alertSlide, stats]
  );

  function dismiss() {
    setDismissed(true);
    setAlertSlide(null);
  }

  return { alert, dismiss };
}