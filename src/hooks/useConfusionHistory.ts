import { useEffect, useRef, useState } from "react";

// Samples the live % every 15 seconds and keeps the last 20 (5 minutes)
export function useConfusionHistory(percent: number, everyMs = 15_000, keep = 20) {
  const [history, setHistory] = useState<number[]>([]);
  const latest = useRef(percent);

  useEffect(() => {
    latest.current = percent;
  }, [percent]);

  useEffect(() => {
    const push = () => setHistory((h) => [...h.slice(-(keep - 1)), latest.current]);
    push();
    const id = setInterval(push, everyMs);
    return () => clearInterval(id);
  }, [everyMs, keep]);

  return history;
}