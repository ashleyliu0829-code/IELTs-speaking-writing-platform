"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLanguage } from "@/lib/i18n";

/**
 * The mock exam button, sitting beside the wordmark rather than in the side
 * nav.
 *
 * A sitting is the one thing on the platform that happens at a particular
 * time and that both sides need to reach in a hurry, so it is given the one
 * place that is the same on every page. The button belongs to the dashboard —
 * it is the dashboard's own state it switches — so it is rendered there and
 * portalled into the slot the layout leaves next to the wordmark.
 *
 * Nothing renders until the slot exists: the layout is a server component and
 * this runs after it, so the first pass has nowhere to go.
 */
export function TopbarMockButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  const { t } = useLanguage();
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setSlot(document.getElementById("topbar-slot"));
  }, []);

  if (!slot) return null;

  return createPortal(
    <button className={`topbar-mock ${active ? "active" : ""}`} type="button" onClick={onClick}>
      {t("模考", "Mock exam")}
    </button>,
    slot
  );
}
