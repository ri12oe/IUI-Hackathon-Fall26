import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate } from "react-router";
import Logo from "../../components/Logo";
import { createSession, getMyActiveSession, type Session } from "../../lib/session";
import { uploadSlides } from "../../lib/slides";
import { getPageCount } from "../../lib/pdf";
import "./HostSetup.scss";

const THRESHOLDS = [
  { value: 25, hint: "More alerts" },
  { value: 35, hint: "Recommended" },
  { value: 50, hint: "Fewer alerts" },
];
const MAX_MB = 25;
const STORAGE_KEY = "muddy:last-setup";

type Saved = { course: string; alertThreshold: number };

// Remember the course and alert level between sessions (this browser only)
function loadSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}
function save(s: Saved) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable; not important */
  }
}

function formatSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function HostSetup() {
  const navigate = useNavigate();
  const [saved] = useState(loadSaved);
  const [course, setCourse] = useState(saved?.course ?? "");
  const [title, setTitle] = useState("");
  const [threshold, setThreshold] = useState(saved?.alertThreshold ?? 35);
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [step, setStep] = useState<"idle" | "creating" | "uploading">("idle");
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<Session | null>(null);

  useEffect(() => {
    getMyActiveSession().then(setActive).catch(() => {});
  }, []);

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    e.target.value = ""; // lets the same file be picked again
    if (!picked) return;
    setFileError(null);

    if (picked.type !== "application/pdf") {
      setFileError("That isn't a PDF. Export your slides as a PDF first.");
      return;
    }
    if (picked.size > MAX_MB * 1024 * 1024) {
      setFileError(`PDFs need to be under ${MAX_MB} MB.`);
      return;
    }
    try {
      setPageCount(await getPageCount(picked));
      setFile(picked);
    } catch {
      setFileError("Couldn't read that PDF. Try exporting it again.");
    }
  }

  async function start(withSlides: boolean) {
    setError(null);
    setStep("creating");
    let session: Session;
    try {
      session = await createSession({
        course: course.trim() || null,
        title: title.trim() || null,
        alert_threshold: threshold,
      });
      save({ course: course.trim(), alertThreshold: threshold });
    } catch (err) {
      setError((err as { message?: string }).message ?? "Couldn't create the session.");
      setStep("idle");
      return;
    }

    if (withSlides && file) {
      setStep("uploading");
      try {
        await uploadSlides(session.id, file);
      } catch {
        // The session exists, so carry on; the presenting screen still offers an upload box
      }
    }
    navigate(`/host/${session.room_code}`);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    start(true);
  }

  const busy = step !== "idle";

  return (
    <main className="setup">
      <header className="setup__top">
        <Logo />
      </header>

      {active && (
        <div className="setup__resume">
          <span>
            Session <strong>{active.room_code}</strong>
            {active.title ? `, ${active.title}` : ""} is still open.
          </span>
          <button type="button" onClick={() => navigate(`/host/${active.room_code}`)}>
            Resume
          </button>
        </div>
      )}

      <form className="setup__card" onSubmit={onSubmit}>
        {saved && <p className="setup__note">Settings copied from your last session</p>}
        <h1>New session</h1>
        <p className="setup__lede">
          Students join from their phones with a room code. No app to install, no sign-ups.
        </p>

        <div className="setup__row">
          <label className="field field--course">
            <span>Course</span>
            <input value={course} onChange={(e) => setCourse(e.target.value)} placeholder="CSCI 24000" maxLength={40} />
          </label>
          <label className="field">
            <span>Lecture title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Recursion & the call stack" maxLength={120} />
          </label>
        </div>

        <div className="field">
          <span>Slides</span>
          {file ? (
            <div className="file">
              <div className="file__icon" aria-hidden="true">PDF</div>
              <div className="file__meta">
                <strong>{file.name}</strong>
                <small>{pageCount} slides, {formatSize(file.size)}</small>
              </div>
              <label className="file__replace">
                Replace
                <input type="file" accept="application/pdf" onChange={handleFile} hidden />
              </label>
            </div>
          ) : (
            <label className="drop">
              <input type="file" accept="application/pdf" onChange={handleFile} hidden />
              <strong>Choose a PDF</strong>
              <small>Export from PowerPoint, Keynote or Google Slides. Up to {MAX_MB} MB.</small>
            </label>
          )}
          {fileError && <p className="setup__error">{fileError}</p>}
        </div>

        <fieldset className="field">
          <legend>Alert me when</legend>
          <div className="segmented" role="radiogroup">
            {THRESHOLDS.map((t) => (
              <label key={t.value} className={`segmented__option ${threshold === t.value ? "is-selected" : ""}`}>
                <input
                  type="radio"
                  name="threshold"
                  value={t.value}
                  checked={threshold === t.value}
                  onChange={() => setThreshold(t.value)}
                />
                <strong>{t.value}% are lost</strong>
                <small>{t.hint}</small>
              </label>
            ))}
          </div>
          <small className="setup__hint">You can turn these off while presenting.</small>
        </fieldset>

        <hr />

        <div className="setup__footer">
          <span className="setup__privacy">No student names are collected</span>
          <button type="button" className="btn btn--secondary" onClick={() => start(false)} disabled={busy}>
            Present without slides
          </button>
          <button type="submit" className="btn btn--primary" disabled={busy || (!!fileError && !file)}>
            {step === "creating" ? "Creating…" : step === "uploading" ? "Uploading slides…" : "Continue"}
          </button>
        </div>
        {error && <p className="setup__error">{error}</p>}
      </form>
    </main>
  );
}