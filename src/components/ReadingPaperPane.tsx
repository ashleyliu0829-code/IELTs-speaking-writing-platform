"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/lib/i18n";
import type { Stroke } from "@/components/ReadingExam";

/**
 * One view of the paper, with a sheet of glass over it to draw on.
 *
 * Two of these sit side by side showing the same document, scrolled wherever
 * each is wanted — the passage held still on one side while the questions
 * move on the other, which is how the test is actually read. They share one
 * loaded document, so the file is fetched and parsed once however many views
 * there are.
 *
 * The pages are drawn here rather than handed to the browser's own viewer,
 * which is a sealed box: a layer floated over it would stay where it was put
 * while the paper scrolled underneath. Owning the pages is what lets a line
 * drawn across a sentence stay across that sentence.
 *
 * Only the pages near the view are held as pixels. A page of this paper is
 * some megabytes of canvas, and two panes keeping all thirteen was most of a
 * gigabyte between them — a tab that stops rather than a paper that scrolls.
 * Pages outside the view go back to an empty frame of the right size and are
 * drawn again on the way back.
 */

type PageSize = { width: number; height: number };

/** Enough either side of the view that scrolling rarely outruns the drawing. */
const keepNear = 2;

/** Retina canvases of a whole page cost more than they are worth here. */
const maxRatio = 1.5;

export function PaperPane({
  pdf,
  sizes,
  label,
  pen,
  color,
  strokes,
  onDraw
}: {
  pdf: PdfDocument | null;
  sizes: PageSize[];
  label: string;
  pen: boolean;
  color: string;
  strokes: Stroke[];
  onDraw: (stroke: Stroke) => void;
}) {
  const { t } = useLanguage();
  const scroller = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1.1);
  const [centre, setCentre] = useState(1);
  const [painted, setPainted] = useState(0);
  const slots = useRef(new Map<number, HTMLDivElement>());
  const inks = useRef(new Map<number, HTMLCanvasElement>());
  const held = useRef(new Set<number>());

  // Which page is in the middle of the view, which decides what is worth
  // holding as pixels.
  useEffect(() => {
    const root = scroller.current;
    if (!root || !sizes.length) return;
    const look = () => {
      const middle = root.scrollTop + root.clientHeight / 2;
      let edge = 0;
      let page = sizes.length;
      for (let index = 0; index < sizes.length; index += 1) {
        edge += sizes[index].height * zoom + 16;
        if (middle <= edge) {
          page = index + 1;
          break;
        }
      }
      setCentre(page);
    };
    look();
    root.addEventListener("scroll", look, { passive: true });
    return () => root.removeEventListener("scroll", look);
  }, [sizes, zoom]);

  // Everything held goes back to an empty frame when the scale changes.
  useEffect(() => {
    held.current.forEach((page) => {
      const slot = slots.current.get(page);
      if (slot) slot.replaceChildren(placeholder(page));
    });
    held.current.clear();
    inks.current.clear();
  }, [zoom]);

  // Draw what is near, free what is not.
  useEffect(() => {
    if (!pdf || !sizes.length) return;
    let cancelled = false;

    const wanted = new Set<number>();
    for (let page = centre - keepNear; page <= centre + keepNear; page += 1) {
      if (page >= 1 && page <= sizes.length) wanted.add(page);
    }

    [...held.current].forEach((page) => {
      if (wanted.has(page)) return;
      const slot = slots.current.get(page);
      if (slot) slot.replaceChildren(placeholder(page));
      inks.current.delete(page);
      held.current.delete(page);
    });

    void (async () => {
      const order = [...wanted].sort((a, b) => Math.abs(a - centre) - Math.abs(b - centre));
      for (const number of order) {
        if (cancelled) return;
        if (held.current.has(number)) continue;
        const slot = slots.current.get(number);
        if (!slot) continue;
        // Claimed before the first await, so a second pass cannot start the
        // same page again — and a page that fails is not retried for ever.
        held.current.add(number);
        try {
          const page = await pdf.getPage(number);
          if (cancelled) return;
          const viewport = page.getViewport({ scale: zoom });
          const ratio = Math.min(window.devicePixelRatio || 1, maxRatio);

          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width * ratio);
          canvas.height = Math.floor(viewport.height * ratio);
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;
          const context = canvas.getContext("2d");
          if (!context) continue;
          context.scale(ratio, ratio);
          await inTurn(number, () => page.render({ canvas, canvasContext: context, viewport }).promise);
          if (cancelled) return;

          const ink = document.createElement("canvas");
          ink.className = "pdf-ink";
          ink.width = canvas.width;
          ink.height = canvas.height;
          ink.style.width = `${viewport.width}px`;
          ink.style.height = `${viewport.height}px`;

          slot.replaceChildren(canvas, ink);
          inks.current.set(number, ink);
          setPainted((n) => n + 1);
        } catch {
          held.current.delete(number);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdf, sizes, centre, zoom]);

  // The ink is repainted whenever it changes or a page is drawn again.
  useEffect(() => {
    inks.current.forEach((ink, page) => paint(ink, strokes.filter((stroke) => stroke.page === page)));
  }, [strokes, painted]);

  function draw(event: React.PointerEvent) {
    if (!pen) return;
    const slot = (event.target as HTMLElement).closest(".pdf-page") as HTMLElement | null;
    const number = Number(slot?.dataset.page || 0);
    const ink = inks.current.get(number);
    if (!slot || !ink) return;
    event.preventDefault();
    const bounds = slot.getBoundingClientRect();
    const points: [number, number][] = [];
    const already = strokes.filter((stroke) => stroke.page === number);
    const add = (clientX: number, clientY: number) => {
      points.push([(clientX - bounds.left) / bounds.width, (clientY - bounds.top) / bounds.height]);
      paint(ink, [...already, { id: "live", page: number, color, points }]);
    };
    add(event.clientX, event.clientY);

    const move = (e: PointerEvent) => add(e.clientX, e.clientY);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (points.length > 1) onDraw({ id: Math.random().toString(36).slice(2, 10), page: number, color, points });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <section className="exam-paper">
      <div className="exam-paper-tools">
        <strong className="exam-paper-label">
          {label}
          {sizes.length ? ` · ${centre}/${sizes.length}` : ""}
        </strong>
        <button className="btn ghost" type="button" onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.15).toFixed(2))))}>
          −
        </button>
        <span className="hint">{Math.round(zoom * 100)}%</span>
        <button className="btn ghost" type="button" onClick={() => setZoom((z) => Math.min(2.5, Number((z + 0.15).toFixed(2))))}>
          +
        </button>
        {!pdf && <span className="hint">{t("加载中...", "Loading...")}</span>}
      </div>
      <div className={`exam-paper-scroll ${pen ? "penning" : ""}`} ref={scroller} onPointerDown={draw}>
        {sizes.map((size, index) => {
          const number = index + 1;
          return (
            <div
              key={number}
              className="pdf-page"
              data-page={number}
              style={{ width: size.width * zoom, height: size.height * zoom }}
              ref={(node) => {
                // React hands the callback a null and then the node again on
                // every render, because its identity changes each time. The
                // null pass must therefore not throw anything away: it used
                // to clear the ink layers, so the pen found nothing to draw
                // on. Stale entries go when the component does.
                if (node) slots.current.set(number, node);
              }}
            />
          );
        })}
      </div>
    </section>
  );
}

/** What a page shows before it is drawn, and again once it is freed. */
function placeholder(page: number) {
  const mark = document.createElement("span");
  mark.className = "pdf-page-waiting";
  mark.textContent = String(page);
  return mark;
}

/**
 * Both views share one document, and PDF.js lets a page be drawn in only one
 * place at a time — ask twice at once and it cancels the first, which left
 * both panes blank. Renders of the same page therefore queue.
 */
const turns = new Map<number, Promise<unknown>>();

function inTurn<T>(page: number, job: () => Promise<T>): Promise<T> {
  const queue = (turns.get(page) || Promise.resolve()).catch(() => undefined);
  const mine = queue.then(job);
  turns.set(page, mine.catch(() => undefined));
  return mine;
}

/** Repaints one page's ink from scratch; strokes are fractions of the page. */
function paint(ink: HTMLCanvasElement, strokes: Stroke[]) {
  const context = ink.getContext("2d");
  if (!context) return;
  const ratio = Math.min(window.devicePixelRatio || 1, maxRatio);
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, ink.width, ink.height);
  context.scale(ratio, ratio);
  const width = ink.width / ratio;
  const height = ink.height / ratio;
  context.lineCap = "round";
  context.lineJoin = "round";
  strokes.forEach((stroke) => {
    if (stroke.points.length < 2) return;
    context.strokeStyle = stroke.color || "#d64a2f";
    context.lineWidth = stroke.width || 2.4;
    context.beginPath();
    stroke.points.forEach(([x, y], index) => {
      const px = x * width;
      const py = y * height;
      if (index === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    });
    context.stroke();
  });
}

/** The bits of PDF.js this file uses, without pulling its types in. */
type PdfDocument = {
  numPages: number;
  getPage: (number: number) => Promise<{
    getViewport: (options: { scale: number }) => { width: number; height: number };
    render: (options: Record<string, unknown>) => { promise: Promise<void> };
  }>;
  destroy: () => void;
};

type Pdfjs = {
  getDocument: (options: { url: string }) => { promise: Promise<PdfDocument> };
  GlobalWorkerOptions: { workerSrc: string };
};

let pdfjsOnce: Promise<Pdfjs> | null = null;

export function loadPdfjs(): Promise<Pdfjs> {
  pdfjsOnce ||= import("pdfjs-dist").then((module) => {
    const pdfjs = module as unknown as Pdfjs;
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    return pdfjs;
  });
  return pdfjsOnce;
}

export type { PdfDocument, PageSize };
