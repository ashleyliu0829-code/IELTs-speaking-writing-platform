"use client";

import { useLayoutEffect, useRef } from "react";
import { diffTokens } from "@/lib/textDiff";

/**
 * Edits text while showing the changes inline, the way Word's review mode does.
 *
 * A textarea cannot do this: it renders one flat string with no styling, so
 * showing insertions and deletions meant a second box repeating the same text.
 *
 * React must not render the contents. Typing and deleting mutate the DOM
 * directly, so React's tree and the real DOM diverge and the next reconcile
 * throws "removeChild: node to be removed is not a child of this node". The
 * host element is therefore rendered empty and its markup written here by hand;
 * React only ever sees an empty div.
 *
 * Deleted words stay visible, struck through, and are contentEditable={false}
 * so the caret cannot land inside text that is no longer part of the value.
 *
 * The caret is tracked in coordinates of the *edited* text rather than of what
 * is on screen, since the deletions on screen are not in the value. Without
 * that mapping the cursor jumps to the start on every keystroke.
 */
export function TrackedTextEditor({
  original,
  value,
  onChange,
  onSelectionChange,
  className = "",
  placeholder = ""
}: {
  original: string;
  value: string;
  onChange: (value: string) => void;
  onSelectionChange?: (selection: { start: number; end: number }) => void;
  className?: string;
  placeholder?: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  // An IME shows uncommitted text in the element. Rewriting the markup mid
  // composition cancels it, so both the rewrite and onChange wait for commit.
  const composingRef = useRef(false);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || composingRef.current) return;

    const html = buildHtml(original, value);
    if (host.innerHTML === html) return;

    const focused = document.activeElement === host;
    const caret = focused ? getCaret(host) : null;
    host.innerHTML = html;
    if (caret !== null) setCaret(host, caret);
  }, [original, value]);

  function emitChange() {
    const host = hostRef.current;
    if (host) onChange(collectEditableText(host));
  }

  function reportSelection() {
    const host = hostRef.current;
    if (!host || !onSelectionChange) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!host.contains(range.commonAncestorContainer)) return;

    const start = offsetOf(host, range.startContainer, range.startOffset);
    const end = offsetOf(host, range.endContainer, range.endOffset);
    onSelectionChange({ start: Math.min(start, end), end: Math.max(start, end) });
  }

  return (
    <div
      ref={hostRef}
      className={`tracked-editor ${className}`.trim()}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      data-placeholder={placeholder}
      onInput={() => {
        if (!composingRef.current) emitChange();
      }}
      onCompositionStart={() => {
        composingRef.current = true;
      }}
      onCompositionEnd={() => {
        composingRef.current = false;
        emitChange();
      }}
      onKeyUp={reportSelection}
      onMouseUp={reportSelection}
    />
  );
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Transcript text is student content, so every part is escaped. */
function buildHtml(original: string, edited: string) {
  return diffTokens(original || "", edited || "")
    .map((part) => {
      const text = escapeHtml(part.text);
      if (part.type === "removed") return `<del contenteditable="false">${text}</del>`;
      if (part.type === "added") return `<ins>${text}</ins>`;
      return `<span>${text}</span>`;
    })
    .join("");
}

/** Text the teacher has actually written: everything except the deletions. */
function collectEditableText(host: HTMLElement) {
  let text = "";
  const walk = (node: Node) => {
    if (node.nodeName === "DEL") return;
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent || "";
      return;
    }
    for (const child of Array.from(node.childNodes)) walk(child);
  };
  for (const child of Array.from(host.childNodes)) walk(child);
  return text;
}

/** Caret position counted in edited-text characters, skipping deletions. */
function getCaret(host: HTMLElement) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return 0;
  const range = selection.getRangeAt(0);
  if (!host.contains(range.startContainer)) return 0;
  return offsetOf(host, range.startContainer, range.startOffset);
}

function offsetOf(host: HTMLElement, container: Node, containerOffset: number) {
  let offset = 0;
  let found = false;

  const walk = (node: Node) => {
    if (found) return;
    if (node === container) {
      if (node.nodeType === Node.TEXT_NODE) {
        offset += containerOffset;
      } else {
        // An element container: the offset counts child nodes, not characters.
        for (let index = 0; index < containerOffset && index < node.childNodes.length; index += 1) {
          const child = node.childNodes[index];
          if (child.nodeName !== "DEL") offset += child.textContent?.length || 0;
        }
      }
      found = true;
      return;
    }
    if (node.nodeName === "DEL") return;
    if (node.nodeType === Node.TEXT_NODE) {
      offset += node.textContent?.length || 0;
      return;
    }
    for (const child of Array.from(node.childNodes)) {
      walk(child);
      if (found) return;
    }
  };

  for (const child of Array.from(host.childNodes)) {
    walk(child);
    if (found) break;
  }

  return offset;
}

function setCaret(host: HTMLElement, target: number) {
  let remaining = target;
  let node: Text | null = null;
  let nodeOffset = 0;

  const walk = (current: Node): boolean => {
    if (current.nodeName === "DEL") return false;
    if (current.nodeType === Node.TEXT_NODE) {
      const length = current.textContent?.length || 0;
      if (remaining <= length) {
        node = current as Text;
        nodeOffset = remaining;
        return true;
      }
      remaining -= length;
      return false;
    }
    for (const child of Array.from(current.childNodes)) {
      if (walk(child)) return true;
    }
    return false;
  };

  for (const child of Array.from(host.childNodes)) {
    if (walk(child)) break;
  }

  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();

  if (node) {
    const text = node as Text;
    range.setStart(text, Math.min(nodeOffset, text.textContent?.length || 0));
  } else {
    range.selectNodeContents(host);
    range.collapse(false);
  }

  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}
