import { useEffect, useState, type ChangeEvent, type Dispatch, type SetStateAction } from "react";
import { QRCodeSVG } from "qrcode.react";
import Logo from "../../components/Logo";
import SlideViewer from "../../components/SlideViewer";
import SessionTimer from "../../components/SessionTimer";
import PresenterBar from "../../components/PresenterBar";
import LivePanel from "../../components/LivePanel";
import ConfusionAlertBanner from "../../components/ConfusionAlertBanner";
import { useLiveConfusion } from "../../hooks/useLiveConfusion";
import { useThresholdAlert } from "../../hooks/useThresholdAlert";
import { useConfusionHistory } from "../../hooks/useConfusionHistory";
import { setCurrentSlide, type Session } from "../../lib/session";
import { uploadSlides } from "../../lib/slides";
import "./Presenting.scss";

type Props = { session: Session; setSession: Dispatch<SetStateAction<Session | null>> };

export default function Presenting({ session, setSession }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [alertsOn, setAlertsOn] = useState(true);
  const [showCode, setShowCode] = useState(false);

  const { stats, bySlide, connected } = useLiveConfusion(session.id);
  const history = useConfusionHistory(stats.percent);
  const { alert, dismiss } = useThresholdAlert(stats, session.current_slide, session.alert_threshold);
  const visibleAlert = alertsOn ? alert : null;

  useEffect(() => {
    document.title = visibleAlert ? `⚠ ${visibleAlert.percent}% lost · Muddy` : "Muddy";
  }, [visibleAlert]);

  async function goTo(slide: number) {
    const max = session.slide_count ?? Infinity;
    const next = Math.min(Math.max(1, slide), max);
    if (next === session.current_slide) return;
    const previous = session.current_slide;
    setSession({ ...session, current_slide: next });
    try {
      await setCurrentSlide(session.id, next);
    } catch (e) {
      setSession((s) => (s ? { ...s, current_slide: previous } : s));
      setError((e as { message?: string }).message ?? "Couldn't change slide.");
    }
  }

  // Keyboard: arrows / clicker change slides, Esc closes the code overlay
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return setShowCode(false);
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        goTo(session.current_slide + 1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        goTo(session.current_slide - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      setSession(await uploadSlides(session.id, file));
    } catch (err) {
      setError((err as { message?: string }).message ?? "Upload failed.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  const baseUrl = import.meta.env.VITE_PUBLIC_URL ?? window.location.origin;
  const joinUrl = `${baseUrl}/join?code=${session.room_code}`;
  const subtitle = [session.course, session.title].filter(Boolean).join(", ");

  return (
    <main className={`present ${panelOpen ? "present--panel" : ""}`}>
      <header className="present__top">
        <Logo />
        {subtitle && <span className="present__subtitle">{subtitle}</span>}
        <span className="present__room">Room {session.room_code}</span>
        <span className="present__spacer" />
        <SessionTimer startedAt={session.presenting_started_at} />
        {/* End session button comes in the next task */}
      </header>

      <div className="present__body">
        <section className="present__stage">
          {visibleAlert && (
            <ConfusionAlertBanner
              alert={visibleAlert}
              currentSlide={session.current_slide}
              onGoTo={goTo}
              onDismiss={dismiss}
            />
          )}

          <div className="present__slide">
            {session.slides_url ? (
              <SlideViewer url={session.slides_url} page={session.current_slide} fit="contain" />
            ) : (
              <label className="present__upload">
                <input type="file" accept="application/pdf" onChange={handleFile} disabled={uploading} hidden />
                <strong>{uploading ? "Uploading…" : "Upload slides (PDF)"}</strong>
                <small>Or keep presenting from your own slides. Prev / Next still tracks the slide number.</small>
              </label>
            )}
          </div>
        </section>

        {panelOpen && (
          <LivePanel
            stats={stats}
            connected={connected}
            history={history}
            bySlide={bySlide}
            currentSlide={session.current_slide}
            threshold={session.alert_threshold}
            alertsOn={alertsOn}
            onToggleAlerts={() => setAlertsOn((v) => !v)}
            onSelectSlide={goTo}
            onClose={() => setPanelOpen(false)}
          />
        )}
      </div>

      <PresenterBar
        current={session.current_slide}
        total={session.slide_count}
        stats={stats}
        threshold={session.alert_threshold}
        panelOpen={panelOpen}
        onPrev={() => goTo(session.current_slide - 1)}
        onNext={() => goTo(session.current_slide + 1)}
        onShowCode={() => setShowCode(true)}
        onTogglePanel={() => setPanelOpen((v) => !v)}
      />

      {error && <p className="present__error" role="alert">{error}</p>}

      {showCode && (
        <div className="codeview" role="dialog" aria-modal="true" aria-label="Join code" onClick={() => setShowCode(false)}>
          <div className="codeview__card" onClick={(e) => e.stopPropagation()}>
            <QRCodeSVG value={joinUrl} size={300} marginSize={1} />
            <div>
              <p className="codeview__url">{new URL(baseUrl).host}/join</p>
              <p className="codeview__code">{session.room_code}</p>
              <button className="btn btn--secondary" onClick={() => setShowCode(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}