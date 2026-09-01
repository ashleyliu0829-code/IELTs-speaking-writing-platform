"use client";

import { diffTokens, hasEdits } from "@/lib/textDiff";

/** The marked-up text on its own, for callers that supply their own framing. */
export function TrackedText({ original, edited }: { original: string; edited: string }) {
  const parts = diffTokens(original || "", edited || original || "");

  return (
    <>
      {parts.map((part, index) => {
        if (part.type === "added") return <ins key={index}>{part.text}</ins>;
        if (part.type === "removed") return <del key={index}>{part.text}</del>;
        return <span key={index}>{part.text}</span>;
      })}
    </>
  );
}

/** Read-only tracked changes, as students see them. */
export function TranscriptDiff({ original, edited }: { original: string; edited: string }) {
  const base = original || "";
  const revised = edited || original || "";
  if (!base.trim() && !revised.trim()) return null;

  return (
    <div className="transcript-review">
      <div className="section-head compact">
        <div>
          <label>Transcript with teacher edits</label>
          <div className="hint">
            {hasEdits(base, revised) ? "Green text was added. Red text was removed." : "No teacher edits yet."}
          </div>
        </div>
      </div>
      <div className="tracked-text" aria-label="Transcript with tracked changes">
        <TrackedText original={base} edited={revised} />
      </div>
    </div>
  );
}
