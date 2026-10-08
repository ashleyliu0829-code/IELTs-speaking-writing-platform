/**
 * Marking a reading answer sheet against the key the teacher typed in.
 *
 * The teacher writes the key the way an IELTS answer key is written, because
 * that is what they are copying from: "TRUE", "20/twenty", "(the) police
 * station", "B, D". Rather than ask them to learn a format, the shapes they
 * already use are understood here.
 *
 * Marking runs on the server and only the verdict is sent back. The key is
 * never handed to the student's browser — an answer sheet on screen beside
 * the answers would not be an exam.
 */

/** A full academic reading paper. The teacher can change it per sitting. */
export const defaultQuestionCount = 40;

/**
 * One answer reduced to what actually has to match.
 *
 * Case and spacing never distinguish a right answer from a wrong one, and a
 * hyphen against a space is the kind of difference a human marker lets go.
 * Spelling is left alone: IELTS marks it, so the platform must too.
 */
export function normalizeAnswer(value: string) {
  let text = String(value == null ? "" : value).trim();
  text = text.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "");
  text = text.replace(/[.。]+$/, "");
  text = text.replace(/[\s　_-]+/g, " ").trim().toLowerCase();

  // The true/false/not given family, written every way a student types it.
  const short: Record<string, string> = {
    t: "true",
    f: "false",
    ng: "not given",
    "n g": "not given",
    notgiven: "not given",
    y: "yes",
    n: "no"
  };
  if (short[text]) return short[text];
  return text;
}

/**
 * Every spelling of one key entry that should be accepted.
 *
 * `/`, `,`, `;` and their full-width twins separate alternatives, which is
 * how a key writes both "20/twenty" and the two letters of a choose-two
 * question. Brackets mark an optional piece — "(the) police station" is right
 * with or without the article — so each bracket doubles the list.
 */
export function acceptedForms(key: string): string[] {
  const raw = String(key == null ? "" : key).trim();
  if (!raw) return [];

  const pieces = raw
    .split(/[/|,;，；、]/)
    .map((piece) => piece.trim())
    .filter(Boolean);

  const forms = new Set<string>();
  for (const piece of pieces) {
    for (const variant of expandOptional(piece)) {
      const normalized = normalizeAnswer(variant);
      if (normalized) forms.add(normalized);
    }
  }
  return [...forms];
}

/** "(the) police station" becomes both "the police station" and "police station". */
function expandOptional(text: string): string[] {
  const match = text.match(/\(([^()]*)\)/);
  if (!match) return [text];
  const before = text.slice(0, match.index);
  const after = text.slice((match.index || 0) + match[0].length);
  return [...expandOptional(before + match[1] + after), ...expandOptional(before + after)];
}

export type ReadingTimer = {
  minutes: number;
  startedAt: string | null;
  endsAt: string | null;
  remainingSeconds: number;
  running: boolean;
  expired: boolean;
};

/**
 * Where the clock is, worked out from the moment the server stored.
 *
 * Nothing is read from the browser, so a reload, a second tab or a closed
 * laptop all carry on from the same instant. A sitting that has not been
 * opened yet simply has no start.
 */
export function readReadingTimer(minutes: number, startedAt: string | null, now = Date.now()): ReadingTimer {
  const allowance = Number(minutes) || 0;
  if (!allowance || !startedAt) {
    return { minutes: allowance, startedAt: null, endsAt: null, remainingSeconds: allowance * 60, running: false, expired: false };
  }
  const start = new Date(startedAt).getTime();
  const end = start + allowance * 60 * 1000;
  const remaining = Math.max(0, Math.round((end - now) / 1000));
  return {
    minutes: allowance,
    startedAt,
    endsAt: new Date(end).toISOString(),
    remainingSeconds: remaining,
    running: remaining > 0,
    expired: remaining <= 0
  };
}

/** A little past the end, so a page handing in at zero is not called late. */
export function isPastReadingGrace(timer: ReadingTimer, graceSeconds = 30, now = Date.now()) {
  if (!timer.endsAt) return false;
  return now > new Date(timer.endsAt).getTime() + graceSeconds * 1000;
}

export type ReadingMark = { question: number; answer: string; correct: boolean };
export type ReadingGrade = { correct: number; total: number; detail: ReadingMark[] };

/**
 * Marks the sheet, one question at a time.
 *
 * Each question stands alone: whether question 7 is right has nothing to do
 * with what was written for question 6. An earlier version grouped adjacent
 * questions that shared a key, so that a choose-two question could not earn
 * the same mark twice — but a run of identical answers is ordinary in a
 * reading paper (fifteen questions whose answer is "A" is a perfectly normal
 * matching task), and that rule silently marked every repeat wrong. A rule
 * that quietly takes marks away is worse than one that occasionally gives a
 * spare: on a choose-two question a student who writes the same letter on
 * both lines now scores both, and the teacher can see that in the breakdown.
 *
 * A question with no key is not marked and does not count towards the total,
 * which is what lets a teacher set a paper of 38 or 40 without saying so.
 */
export function gradeReading(keys: string[], answers: string[]): ReadingGrade {
  const detail: ReadingMark[] = [];
  let correct = 0;
  let total = 0;

  keys.forEach((raw, index) => {
    const key = String(raw || "").trim();
    const given = String(answers[index] || "").trim();
    if (!key) {
      detail.push({ question: index + 1, answer: given, correct: false });
      return;
    }
    const normalized = normalizeAnswer(given);
    const hit = Boolean(normalized) && acceptedForms(key).includes(normalized);
    if (hit) correct += 1;
    total += 1;
    detail.push({ question: index + 1, answer: given, correct: hit });
  });

  return { correct, total, detail };
}

/**
 * The band a raw reading score is worth, for the Academic paper.
 *
 * Reported as a guide rather than a result: the table is the public IELTS
 * one, and real papers vary a little either way. Only a full forty-question
 * paper gets one — scaling six questions up to a band says more about the
 * arithmetic than about the student.
 */
export function readingBand(correct: number, total: number): number | null {
  if (total !== 40) return null;
  const scaled = Math.round((correct / total) * 40);
  const table: [number, number][] = [
    [39, 9],
    [37, 8.5],
    [35, 8],
    [33, 7.5],
    [30, 7],
    [27, 6.5],
    [23, 6],
    [19, 5.5],
    [15, 5],
    [13, 4.5],
    [10, 4],
    [8, 3.5],
    [6, 3],
    [4, 2.5]
  ];
  for (const [threshold, band] of table) if (scaled >= threshold) return band;
  return 0;
}
