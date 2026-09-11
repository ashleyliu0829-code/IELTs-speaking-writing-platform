"use client";

import { useEffect, useState } from "react";

/**
 * Switches between the two palettes, for comparing them.
 *
 * The theme is a data attribute on <html>; globals.css does the rest. Three
 * ways to set it, in order of precedence:
 *
 *   ?theme=navy in the URL   — applied for this page only, never saved, so two
 *                              frames of the same origin can show different
 *                              palettes without fighting over localStorage.
 *   the toggle in the topbar — saved, so it sticks across pages.
 *   nothing                  — the default palette.
 *
 * This is a comparison aid. When a palette is chosen it can go, along with
 * the [data-theme="navy"] block in globals.css.
 */

type Theme = "cream" | "navy";

const storageKey = "palette";

function readTheme(): { theme: Theme; pinned: boolean } {
  const fromUrl = new URLSearchParams(window.location.search).get("theme");
  if (fromUrl === "navy" || fromUrl === "cream") return { theme: fromUrl, pinned: true };
  let saved: string | null = null;
  try {
    saved = window.localStorage.getItem(storageKey);
  } catch {
    saved = null;
  }
  return { theme: saved === "navy" ? "navy" : "cream", pinned: false };
}

function applyTheme(theme: Theme) {
  if (theme === "navy") document.documentElement.dataset.theme = "navy";
  else delete document.documentElement.dataset.theme;
}

export function ThemeSwitch() {
  const [theme, setTheme] = useState<Theme>("cream");
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    const initial = readTheme();
    setTheme(initial.theme);
    setPinned(initial.pinned);
    applyTheme(initial.theme);
  }, []);

  function toggle() {
    const next: Theme = theme === "navy" ? "cream" : "navy";
    setTheme(next);
    applyTheme(next);
    try {
      window.localStorage.setItem(storageKey, next);
    } catch {
      // A page that cannot save still switches for this visit.
    }
  }

  // A frame pinned by its URL is not for toggling: it shows one palette so the
  // other frame can show the other.
  if (pinned) return null;

  return (
    <button className="theme-switch" type="button" onClick={toggle} title="切换配色（对比用）">
      <span className="theme-switch-dot" aria-hidden="true" />
      {theme === "navy" ? "藏青 · 珊瑚" : "奶油 · 墨绿"}
    </button>
  );
}
