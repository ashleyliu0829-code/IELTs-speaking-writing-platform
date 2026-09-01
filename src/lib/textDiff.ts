export type DiffPart = {
  type: "same" | "added" | "removed";
  text: string;
};

/**
 * Word-level diff, used both to display a teacher's edits and to drive the
 * tracked-changes editor.
 *
 * Whitespace is kept as its own token so the rebuilt text spaces correctly and
 * a changed word does not drag its neighbours into the diff.
 */
export function diffTokens(original: string, edited: string): DiffPart[] {
  const left = tokenize(original);
  const right = tokenize(edited);
  const table = createLcsTable(left, right);
  const parts: DiffPart[] = [];
  let i = 0;
  let j = 0;

  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      pushPart(parts, "same", left[i]);
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      pushPart(parts, "removed", left[i]);
      i += 1;
    } else {
      pushPart(parts, "added", right[j]);
      j += 1;
    }
  }

  while (i < left.length) {
    pushPart(parts, "removed", left[i]);
    i += 1;
  }

  while (j < right.length) {
    pushPart(parts, "added", right[j]);
    j += 1;
  }

  return parts;
}

export function hasEdits(original: string, edited: string) {
  return (original || "").trim() !== (edited || original || "").trim();
}

function tokenize(text: string) {
  return text.match(/\s+|[^\s]+/g) || [];
}

function createLcsTable(left: string[], right: string[]) {
  const table = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      table[i][j] = left[i] === right[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  return table;
}

function pushPart(parts: DiffPart[], type: DiffPart["type"], text: string) {
  const last = parts[parts.length - 1];
  if (last?.type === type) {
    last.text += text;
    return;
  }
  parts.push({ type, text });
}
