"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * One language for the whole site.
 *
 * The teacher dashboard used to keep its own switch and its own key in
 * localStorage; the student portal had none. Now both read the same context
 * and the switch lives in the topbar, so a teacher who flipped to English sees
 * English on every page, and so does a student.
 *
 * Text is written inline as t("中文", "English") at the point of use rather
 * than looked up by key: the Chinese is the source of truth and stays
 * readable in the code, and there is no catalogue to fall out of step.
 *
 * Helpers that run outside a component (date formatters, label builders) use
 * tr(), which reads the same value from the document; they are only ever
 * called during a render, so they see the current language.
 */

export type Language = "zh" | "en";

const storageKey = "uiLanguage";
const legacyKeys = ["teacherLanguage", "homeLanguage"];

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  toggle: () => void;
  t: (zh: string, en: string) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function readSaved(): Language {
  try {
    for (const key of [storageKey, ...legacyKeys]) {
      const saved = window.localStorage.getItem(key);
      if (saved === "zh" || saved === "en") return saved;
    }
  } catch {
    // No storage: start in Chinese.
  }
  return "zh";
}

function applyToDocument(language: Language) {
  document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  document.documentElement.dataset.lang = language;
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // Chinese on the server and on the first client paint, so hydration
  // matches; the saved choice is applied in an effect.
  const [language, setLanguageState] = useState<Language>("zh");

  useEffect(() => {
    const saved = readSaved();
    setLanguageState(saved);
    applyToDocument(saved);
  }, []);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    applyToDocument(next);
    try {
      window.localStorage.setItem(storageKey, next);
    } catch {
      // Still switches for this visit.
    }
  }, []);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      toggle: () => setLanguage(language === "zh" ? "en" : "zh"),
      t: (zh, en) => (language === "zh" ? zh : en)
    }),
    [language, setLanguage]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) {
    // Outside the provider (a test, a stray import): behave as Chinese rather
    // than throw, so a page never blanks over a language.
    return {
      language: "zh" as Language,
      setLanguage: () => undefined,
      toggle: () => undefined,
      t: (zh: string) => zh
    };
  }
  return value;
}

/** For code that runs outside a component but during a render. */
export function currentLanguage(): Language {
  if (typeof document === "undefined") return "zh";
  return document.documentElement.dataset.lang === "en" ? "en" : "zh";
}

export function tr(zh: string, en: string) {
  return currentLanguage() === "zh" ? zh : en;
}

/** The wordmark in the topbar. */
export function BrandTitle() {
  const { t } = useLanguage();
  return (
    <a className="brand-title" href="/">
      {t("IELTS 作业平台", "IELTS Homework Platform")}
    </a>
  );
}

/** The switch in the topbar. */
export function LanguageSwitch() {
  const { language, toggle } = useLanguage();
  return (
    <button className="lang-switch" type="button" onClick={toggle} aria-label="Switch language">
      {language === "zh" ? "English" : "中文"}
    </button>
  );
}
