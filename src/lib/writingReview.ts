export type WritingInlineComment = {
  id: string;
  quote: string;
  comment: string;
};

export type WritingReviewPayload = {
  general: string;
  inlineComments: WritingInlineComment[];
};

const WRITING_REVIEW_PREFIX = "__WRITING_REVIEW_V1__";

export function parseWritingReviewComment(value = ""): WritingReviewPayload {
  if (!value.startsWith(WRITING_REVIEW_PREFIX)) {
    return { general: value, inlineComments: [] };
  }

  try {
    const parsed = JSON.parse(value.slice(WRITING_REVIEW_PREFIX.length)) as Partial<WritingReviewPayload>;
    return {
      general: parsed.general || "",
      inlineComments: Array.isArray(parsed.inlineComments) ? parsed.inlineComments : []
    };
  } catch {
    return { general: "", inlineComments: [] };
  }
}

export function stringifyWritingReviewComment(payload: WritingReviewPayload) {
  return `${WRITING_REVIEW_PREFIX}${JSON.stringify(payload)}`;
}

export function visibleWritingReviewComment(value = "") {
  const payload = parseWritingReviewComment(value);
  return payload.general;
}
