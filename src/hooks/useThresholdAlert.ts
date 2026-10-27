import { useEffect, useRef, useState } from "react";
import type { ConfusionStats } from "../lib/confusion";

export const ALERT_ON_PERCENT = 35;  // show the alert at or above this
export const ALERT_OFF_PERCENT = 25; // clear it below this
export const ALERT_MIN_LOST = 2;     // ignore tiny rooms (1 of 1 = 100%)

export type ConfusionAlert = ConfusionStats & { slide: number };

export function useThresholdAlert(stats: ConfusionStats, currentSlide: number) {
  const [alert, setAlert] = useState<ConfusionAlert | null>(null);
  const dismissedRef = useRef(false);

  useEffect(() => {
    const id = setTimeout(() => {
      // Confusion has dropped: clear the alert and allow it to fire again later
      if (stats.percent < ALERT_OFF_PERCENT) {
        dismissedRef.current = false;
        setAlert(null);
        return;
      }

      const high = stats.percent >= ALERT_ON_PERCENT && stats.lost >= ALERT_MIN_LOST;

      setAlert((prev) => {
        if (prev) return { ...prev, ...stats };        // already showing: keep the numbers live
        if (high && !dismissedRef.current) {
          return { ...stats, slide: currentSlide };    // new alert, tied to the slide it started on
        }
        return null;
      });
    }, 0);
    return () => clearTimeout(id);
  }, [stats, currentSlide]);

  function dismiss() {
    dismissedRef.current = true;
    setAlert(null);
  }

  return { alert, dismiss };
}