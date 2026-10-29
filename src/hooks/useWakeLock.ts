import { useEffect, useRef, useState } from "react";

// Keeps the screen on while `enabled` is true and the page is visible.
// Does nothing on browsers that don't support it.
export function useWakeLock(enabled: boolean) {
  const lockRef = useRef<WakeLockSentinel | null>(null);
  const [active, setActive] = useState(false);
  const supported = typeof navigator !== "undefined" && "wakeLock" in navigator;

  useEffect(() => {
    if (!enabled || !supported) return;
    let cancelled = false;

    async function request() {
      if (cancelled || lockRef.current || document.visibilityState !== "visible") return;
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) {
          lock.release();
          return;
        }
        lockRef.current = lock;
        setActive(true);
        // The browser releases the lock when the page is hidden
        lock.addEventListener("release", () => {
          lockRef.current = null;
          setActive(false);
        });
      } catch {
        // Refused (low battery mode, no user gesture yet, etc.). Try again on the next tap.
      }
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") request();
    };

    request();
    document.addEventListener("visibilitychange", onVisible);
    // Some browsers only grant the lock after a tap, so retry on the first one
    document.addEventListener("pointerdown", request);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("pointerdown", request);
      lockRef.current?.release().catch(() => {});
      lockRef.current = null;
      setActive(false);
    };
  }, [enabled, supported]);

  return { supported, active };
}