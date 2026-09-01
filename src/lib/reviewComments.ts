export type InlineComment = {
  id: string;
  /** The text the teacher selected, kept so the note stays anchored to it. */
  quote: string;
  comment: string;
};

export type ReviewComment = {
  general: string;
  inlineComments: InlineComment[];
};

/**
 * Teacher notes attached to a passage, used for both written answers and
 * speaking transcripts.
 *
 * A feedback detail is a single text column, so the structured form is encoded
 * into it behind a marker. Anything without the marker is a plain comment from
 * before this existed and reads back as `general`, which is what keeps old
 * feedback rendering.
 *
 * The marker still says WRITING because that is what is already stored in the
 * database; renaming it would strip the inline notes off every existing
 * written review.
 */
const reviewMarker = "__WRITING_REVIEW_V1__";

export function parseReviewComment(value = ""): ReviewComment {
  if (!value.startsWith(reviewMarker)) {
    return { general: value, inlineComments: [] };
  }

  try {
    const parsed = JSON.parse(value.slice(reviewMarker.length)) as Partial<ReviewComment>;
    return {
      general: parsed.general || "",
      inlineComments: Array.isArray(parsed.inlineComments) ? parsed.inlineComments : []
    };
  } catch {
    return { general: "", inlineComments: [] };
  }
}

export function stringifyReviewComment(payload: ReviewComment) {
  return `${reviewMarker}${JSON.stringify(payload)}`;
}

/** The plain comment, for places that show no inline notes. */
export function visibleReviewComment(value = "") {
  return parseReviewComment(value).general;
}

export function newInlineCommentId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
