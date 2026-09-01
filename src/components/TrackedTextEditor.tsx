"use client";

import { useEffect, useRef } from "react";
import { diffTokens } from "@/lib/textDiff";

/**
 * Edits text while showing the changes inline, the way Word's review mode does.
 *
 * A textarea cannot do this: it renders one flat string with no styling, so
 * showing insertions and deletions meant a second box repeating the same text.
 * This is a contentEditable surface that re-renders the diff against the
 * original after every keystroke.
 *
 * Deleted words stay visible, struck through, and are marked
 * contentEditable={false} so they behave as marks rather than as text the
 * teacher can put a cursor inside. Everything else is live.
 *
 * The caret is tracked in coordinates of the *edited* text, not of what is on
 * screen, since the deletions on screen are not part of the value. Without that
 * mapping the cursor jumps to the start on every re-render.
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
  const caretRef = useRef<number | null>(null);

  const parts = diffTokens(original || "", value || "");

  useEffect(() => {
    const host = hostRef.current;
    if (!host || caretRef.current === null) return;
    setCaret(host, caretRef.current);
    caretRef.current = null;
  });

  function readValue() {
    const host = hostRef.current;
    if (!host) return "";
    return collectEditableText(host);
  }

  function handleInput() {
    const host = hostRef.current;
    if (!host) return;
    caretRef.current = getCaret(host);
    onChange(readValue());
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
      onInput={handleInput}
      onKeyUp={reportSelection}
      onMouseUp={reportSelection}
    >
      {parts.map((part, index) => {
        if (part.type === "removed") {
          return (
            <del key={index} contentEditable={false}>
              {part.text}
            </del>
          );
        }
        if (part.type === "added") return <ins key={index}>{part.text}</ins>;
        return <span key={index}>{part.text}</span>;
      })}
    </div>
  );
}

/** Text the teacher has actually written: everything except the deletions. */
function collectEditableText(host: HTMLElement) {
  let text = "";
  for (const node of Array.from(host.childNodes)) {
    if (node.nodeName === "DEL") continue;
    text += node.textContent || "";
  }
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
    if (node === container && node.nodeType === Node.TEXT_NODE) {
      offset += containerOffset;
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
    if (node === container) found = true;
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
    range.setStart(node, Math.min(nodeOffset, (node as Text).textContent?.length || 0));
  } else {
    // Past the end, or nothing editable yet.
    range.selectNodeContents(host);
    range.collapse(false);
  }

  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}
