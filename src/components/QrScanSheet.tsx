import { useEffect, useLayoutEffect, useRef, useState } from "react";
import QrScanner from "qr-scanner";
import "./QrScanSheet.scss";

type Props = {
  onCode: (code: string) => void;
  onClose: () => void;
};

// Accepts a Muddy join link (…/join?code=ABCD) or just the 4 letters
function codeFrom(text: string): string | null {
  const plain = text.trim().toUpperCase();
  if (/^[A-Z]{4}$/.test(plain)) return plain;
  try {
    const code = new URL(text).searchParams.get("code")?.toUpperCase();
    return code && /^[A-Z]{4}$/.test(code) ? code : null;
  } catch {
    return null;
  }
}

type Status = "starting" | "scanning" | "denied" | "unavailable";

export default function QrScanSheet({ onCode, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<Status>("starting");
  const [hint, setHint] = useState<string | null>(null);
  const doneRef = useRef(false);

  // Keep the latest callback without restarting the camera on every render
  const onCodeRef = useRef(onCode);
  useLayoutEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let scanner: QrScanner | null = null;
    let cancelled = false;

    (async () => {
      if (!(await QrScanner.hasCamera())) {
        if (!cancelled) setStatus("unavailable");
        return;
      }

      scanner = new QrScanner(
        video,
        (result) => {
          if (doneRef.current) return;
          const code = codeFrom(result.data);
          if (!code) {
            setHint("That QR code isn't a Muddy room. Try the one on the projector.");
            return;
          }
          doneRef.current = true;
          navigator.vibrate?.(40);
          scanner?.stop();
          onCodeRef.current(code);
        },
        {
          preferredCamera: "environment", // back camera
          maxScansPerSecond: 8,
          returnDetailedScanResult: true,
        }
      );

      try {
        await scanner.start();
        if (!cancelled) setStatus("scanning");
      } catch (e) {
        if (cancelled) return;
        const msg = String((e as { name?: string })?.name ?? e);
        setStatus(/NotAllowed|denied|permission/i.test(msg) ? "denied" : "unavailable");
      }
    })();

    return () => {
      cancelled = true;
      scanner?.destroy(); // turns the camera off
    };
  }, []);

  // Escape closes (useful when testing on a laptop)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const blocked = status === "denied" || status === "unavailable";

  return (
    <div className="scan" role="dialog" aria-modal="true" aria-label="Scan the QR code">
      <video ref={videoRef} className="scan__video" playsInline muted />

      <header className="scan__top">
        <button className="scan__cancel" onClick={onClose}>Cancel</button>
      </header>

      {!blocked && (
        <>
          <div className="scan__frame" aria-hidden="true"><i /><i /><i /><i /></div>
          <p className="scan__tip">
            {status === "starting" ? "Starting camera…" : hint ?? "Point at the QR code on the projector"}
          </p>
        </>
      )}

      {blocked && (
        <div className="scan__blocked">
          <strong>{status === "denied" ? "Camera access is off" : "No camera available"}</strong>
          <p>
            {status === "denied"
              ? "Allow camera access for this site in your browser settings, or just type the 4-letter code."
              : "This device can't open a camera here. Type the 4-letter code instead."}
          </p>
          <button className="btn btn--primary" onClick={onClose}>Type the code</button>
        </div>
      )}
    </div>
  );
}