"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/lib/i18n";
import type { Mark } from "@/components/ReadingExam";

/**
 * The paper itself, drawn page by page with a real text layer over it.
 *
 * The browser's own PDF viewer would be less work, but it is a sealed box:
 * nothing can be drawn on it and nothing can be read out of it. Rendering the
 * pages here means the words are selectable, so a student can highlight them
 * the way they would in the real test, and a highlight can be put back on the
 * page afterwards — the rectangles are stored as fractions of the page, so
 * they land on the same words whatever the window is doing.
 */
export function PaperPane({
  src,
  marks,
  onAdd,
  onOpenNote
}: {
  src: string;
  marks: Mark[];
  onAdd: (mark: Mark) => void;
  onOpenNote: (mark: Mark) => void;
}) {
  const { t } = useLanguage();
  const holder = useRef<HTMLDivElement | null>(null);
  const [pages, setPages] = useState(0);
  const [status, setStatus] = useState("");
  const [zoom, setZoom] = useState(1.25);

  // PDF.js draws a page in chunks scheduled on animation frames, and a
  // browser gives none of those to a tab that is not on screen. The exam
  // opens in its own tab, so it is often exactly that tab: rendering stopped
  // on the first page and stayed there, which looked like a paper missing
  // most of itself. Standing in for the scheduler while the tab is hidden is
  // the only way through — the frames are never coming.
  useEffect(() => {
    const nativeRequest = window.requestAnimationFrame.bind(window);
    const nativeCancel = window.cancelAnimationFrame.bind(window);
    const standIns = new Set<number>();

    window.requestAnimationFrame = (callback: FrameRequestCallback) => {
      if (document.visibilityState !== "hidden") return nativeRequest(callback);
      const id = window.setTimeout(() => {
        standIns.delete(id);
        callback(performance.now());
      }, 16);
      standIns.add(id);
      return id;
    };
    window.cancelAnimationFrame = (id: number) => {
      if (standIns.delete(id)) window.clearTimeout(id);
      else nativeCancel(id);
    };

    return () => {
      window.requestAnimationFrame = nativeRequest;
      window.cancelAnimationFrame = nativeCancel;
      standIns.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let doc: { destroy: () => void } | null = null;

    void (async () => {
      try {
        setStatus("loading");
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const task = pdfjs.getDocument({ url: src });
        const pdf = await task.promise;
        if (cancelled) {
          void pdf.destroy();
          return;
        }
        doc = pdf;
        setPages(pdf.numPages);

        const root = holder.current;
        if (!root) return;
        root.replaceChildren();

        for (let number = 1; number <= pdf.numPages; number += 1) {
          const page = await pdf.getPage(number);
          if (cancelled) return;
          const viewport = page.getViewport({ scale: zoom });

          const wrap = document.createElement("div");
          wrap.className = "pdf-page";
          wrap.dataset.page = String(number);
          wrap.style.width = `${viewport.width}px`;
          wrap.style.height = `${viewport.height}px`;

          const canvas = document.createElement("canvas");
          const ratio = window.devicePixelRatio || 1;
          canvas.width = Math.floor(viewport.width * ratio);
          canvas.height = Math.floor(viewport.height * ratio);
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;
          wrap.appendChild(canvas);

          const layer = document.createElement("div");
          layer.className = "pdf-text";
          layer.style.width = `${viewport.width}px`;
          layer.style.height = `${viewport.height}px`;
          wrap.appendChild(layer);

          const overlay = document.createElement("div");
          overlay.className = "pdf-marks";
          wrap.appendChild(overlay);

          root.appendChild(wrap);

          const context = canvas.getContext("2d");
          if (!context) continue;
          context.scale(ratio, ratio);
          const task = page.render({ canvas, canvasContext: context, viewport });
          // Rendering is scheduled on animation frames, which a hidden tab
          // does not get: a paper opened and then left in the background
          // stops where it is and carries on when the student looks back.
          await task.promise;
          if (cancelled) return;

          const text = await page.getTextContent();
          const textLayer = new pdfjs.TextLayer({ textContentSource: text, container: layer, viewport });
          await textLayer.render();
        }
        if (!cancelled) setStatus("");
      } catch (problem) {
        if (!cancelled) setStatus(problem instanceof Error ? problem.message : "failed");
      }
    })();

    return () => {
      cancelled = true;
      doc?.destroy();
    };
  }, [src, zoom]);

  // Highlights are painted after every render and whenever they change, so a
  // zoom or a reload puts them back over the same words.
  useEffect(() => {
    const root = holder.current;
    if (!root) return;
    root.querySelectorAll<HTMLDivElement>(".pdf-marks").forEach((overlay) => {
      const page = Number((overlay.parentElement as HTMLElement)?.dataset.page || 0);
      const width = overlay.parentElement?.clientWidth || 0;
      const height = overlay.parentElement?.clientHeight || 0;
      overlay.replaceChildren();
      marks
        .filter((mark) => mark.page === page)
        .forEach((mark) => {
          mark.rects.forEach((rect, index) => {
            const box = document.createElement("button");
            box.type = "button";
            box.className = `pdf-mark ${mark.note ? "has-note" : ""}`;
            box.style.left = `${rect.x * width}px`;
            box.style.top = `${rect.y * height}px`;
            box.style.width = `${rect.w * width}px`;
            box.style.height = `${rect.h * height}px`;
            box.title = mark.note || "";
            if (index === 0 && mark.note) box.dataset.note = "1";
            box.addEventListener("click", () => onOpenNote(mark));
            overlay.appendChild(box);
          });
        });
    });
  }, [marks, pages, zoom, status, onOpenNote]);

  function highlight() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    const page = (range.startContainer.parentElement as HTMLElement)?.closest(".pdf-page") as HTMLElement | null;
    if (!page) return;
    const bounds = page.getBoundingClientRect();
    const rects = [...range.getClientRects()]
      .filter((rect) => rect.width > 1 && rect.height > 1)
      .map((rect) => ({
        x: (rect.left - bounds.left) / bounds.width,
        y: (rect.top - bounds.top) / bounds.height,
        w: rect.width / bounds.width,
        h: rect.height / bounds.height
      }));
    if (!rects.length) return;
    onAdd({ id: Math.random().toString(36).slice(2, 10), page: Number(page.dataset.page || 1), rects });
    selection.removeAllRanges();
  }

  return (
    <section className="exam-paper">
      <div className="exam-paper-tools">
        <button className="btn ghost" type="button" onClick={highlight}>
          {t("高亮选中的文字", "Highlight the selection")}
        </button>
        <button className="btn ghost" type="button" onClick={() => setZoom((z) => Math.max(0.6, Number((z - 0.15).toFixed(2))))}>
          −
        </button>
        <span className="hint">{Math.round(zoom * 100)}%</span>
        <button className="btn ghost" type="button" onClick={() => setZoom((z) => Math.min(2.5, Number((z + 0.15).toFixed(2))))}>
          +
        </button>
        {status === "loading" && <span className="hint">{t("试卷加载中...", "Loading the paper...")}</span>}
        {status && status !== "loading" && <span className="error">{status}</span>}
      </div>
      <div className="exam-paper-scroll" ref={holder} onMouseUp={highlight} />
    </section>
  );
}
