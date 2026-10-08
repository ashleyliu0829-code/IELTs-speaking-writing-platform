/**
 * The speaking score: four criteria, and the band they add up to.
 *
 * The criteria are the public IELTS ones, and the overall band is their mean
 * rounded to the nearest half — the examiner's own arithmetic, so a teacher
 * marking here gets the same number they would get on paper. It is worked out
 * rather than typed, because a mean of four halves is exactly the kind of sum
 * that goes wrong at the end of a long day.
 */

export const speakingCriteria = [
  { key: "fluency", zh: "流利与连贯", en: "Fluency and coherence" },
  { key: "lexical", zh: "词汇", en: "Lexical resource" },
  { key: "grammar", zh: "语法", en: "Grammatical range and accuracy" },
  { key: "pronunciation", zh: "发音", en: "Pronunciation" }
] as const;

export type SpeakingCriteriaKey = (typeof speakingCriteria)[number]["key"];
export type SpeakingCriteria = Partial<Record<SpeakingCriteriaKey, number>>;

/** The bands a criterion may take: 0 to 9, in halves. */
export const bandSteps = Array.from({ length: 19 }, (_, index) => index / 2);

export function isBand(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 9 && Number.isInteger(number * 2);
}

/**
 * The overall band, or null until all four are in.
 *
 * Half of a score is not a score: three criteria out of four would give a
 * mean that looks finished and is not, so nothing is reported until the
 * fourth is there.
 */
export function speakingBand(criteria: SpeakingCriteria): number | null {
  const values = speakingCriteria.map((item) => criteria[item.key]);
  if (values.some((value) => !isBand(value))) return null;
  const mean = values.reduce<number>((sum, value) => sum + Number(value), 0) / values.length;
  // The examiner's rounding: .25 goes up to the half, .75 up to the whole.
  return Math.round(mean * 2) / 2;
}
