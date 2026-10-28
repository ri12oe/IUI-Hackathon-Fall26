import { useEffect, useRef, useState } from "react";
import type { RenderTask } from "pdfjs-dist";
import { loadPdf } from "../lib/pdf";
import "./SlideViewer.scss";

type Props = {
  url: string;
  page: number;
  // "width": fill the width, height follows (phones)
  // "contain": fit inside the box's width AND height (presenting screen)
  fit?: "width" | "contain";
};

export default function SlideViewer({ url, page, fit = "width" }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  // Track the container's size
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBox({ w: Math.floor(width), h: Math.floor(height) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!box.w) return;
    let task: RenderTask | null = null;
    let cancelled = false;

    (async () => {
      try {
        const pdf = await loadPdf(url);
        const pdfPage = await pdf.getPage(Math.min(Math.max(page, 1), pdf.numPages));
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (cancelled || !canvas || !ctx) return;

        const base = pdfPage.getViewport({ scale: 1 });
        const byWidth = box.w / base.width;
        const scale =
          fit === "contain" && box.h > 0
            ? Math.min(byWidth, box.h / base.height) // fit both directions
            : byWidth;

        const viewport = pdfPage.getViewport({ scale });
        const dpr = window.devicePixelRatio || 1;

        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        task = pdfPage.render({
          canvasContext: ctx,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        });
        await task.promise;
        if (!cancelled) setStatus("ready");
      } catch (e) {
        if (!cancelled && (e as { name?: string }).name !== "RenderingCancelledException") {
          setStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [url, page, box.w, box.h, fit]);

  return (
    <div
      ref={wrapRef}
      className={`slide slide--${fit} ${status === "ready" ? "is-ready" : ""}`}
    >
      <canvas ref={canvasRef} />
      {status !== "ready" && (
        <p className="slide__status">
          {status === "error" ? "Couldn't load slides." : "Loading slides…"}
        </p>
      )}
    </div>
  );
}