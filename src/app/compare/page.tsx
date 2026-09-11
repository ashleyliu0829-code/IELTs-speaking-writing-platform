"use client";

import { useState } from "react";

/**
 * The same page twice, one palette each, side by side.
 *
 * Two frames of the app, pinned to a palette by ?theme=, scaled to half so a
 * desktop layout fits in each half of the window. Log in once and both frames
 * are logged in — they share the cookie. Type any path to compare that page.
 *
 * A comparison aid, like ThemeSwitch: delete both when a palette is chosen.
 */

const pages = [
  ["/", "首页"],
  ["/teacher", "老师工作台"],
  ["/student", "学生登录"]
];

export default function ComparePage() {
  const [path, setPath] = useState("/teacher");
  const [draft, setDraft] = useState("/teacher");
  const [scale, setScale] = useState(0.5);

  function go() {
    const next = draft.trim();
    if (next.startsWith("/")) setPath(next);
  }

  return (
    <main className="compare">
      <div className="compare-bar">
        <strong>配色对比</strong>
        {pages.map(([href, label]) => (
          <button
            className={`compare-page ${path === href ? "active" : ""}`}
            key={href}
            type="button"
            onClick={() => {
              setPath(href);
              setDraft(href);
            }}
          >
            {label}
          </button>
        ))}
        <input
          className="compare-path"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && go()}
          placeholder="/teacher"
        />
        <button className="compare-page" type="button" onClick={go}>
          打开
        </button>
        <label className="compare-scale">
          缩放
          <input
            type="range"
            min="0.4"
            max="1"
            step="0.05"
            value={scale}
            onChange={(event) => setScale(Number(event.target.value))}
          />
          {Math.round(scale * 100)}%
        </label>
      </div>

      <div className="compare-panes">
        <Pane title="奶油 · 墨绿（现在）" src={`${path}?theme=cream`} scale={scale} />
        <Pane title="藏青 · 珊瑚（对比）" src={`${path}?theme=navy`} scale={scale} />
      </div>
    </main>
  );
}

function Pane({ title, src, scale }: { title: string; src: string; scale: number }) {
  // The frame is laid out at full desktop width and scaled down, so both
  // halves show the desktop layout rather than the phone one.
  const width = `${100 / scale}%`;
  return (
    <section className="compare-pane">
      <header className="compare-pane-head">{title}</header>
      <div className="compare-pane-body">
        <iframe
          title={title}
          src={src}
          style={{ width, height: `${100 / scale}%`, transform: `scale(${scale})`, transformOrigin: "0 0" }}
        />
      </div>
    </section>
  );
}
