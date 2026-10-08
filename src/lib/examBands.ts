/**
 * Raw scores to bands, and the four skills to an overall.
 *
 * Listening and Academic Reading are marked out of forty and converted with
 * their own published tables — they are not the same table, and reading is
 * the harsher of the two, so sharing one would quietly hand out marks.
 *
 * A paper that is not out of forty gets no band: scaling fifteen questions up
 * to a band says more about the arithmetic than about the student.
 */

type BandTable = [number, number][];

/** IELTS Listening, out of 40. */
const listeningTable: BandTable = [
  [39, 9],
  [37, 8.5],
  [35, 8],
  [32, 7.5],
  [30, 7],
  [26, 6.5],
  [23, 6],
  [18, 5.5],
  [16, 5],
  [13, 4.5],
  [11, 4],
  [8, 3.5],
  [6, 3],
  [4, 2.5]
];

/** IELTS Academic Reading, out of 40. */
const readingTable: BandTable = [
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

function lookUp(table: BandTable, correct: number, total: number): number | null {
  if (total !== 40) return null;
  for (const [threshold, band] of table) if (correct >= threshold) return band;
  return 0;
}

export function readingBand(correct: number, total: number) {
  return lookUp(readingTable, correct, total);
}

export function listeningBand(correct: number, total: number) {
  return lookUp(listeningTable, correct, total);
}

/**
 * The overall band: the mean of the four skills, rounded to the nearest half,
 * which is the way the certificate reports it. Nothing until all four are in
 * — an average of three is a number that looks finished and is not.
 */
export function overallBand(bands: (number | null | undefined)[]): number | null {
  if (bands.length !== 4 || bands.some((band) => typeof band !== "number")) return null;
  const mean = (bands as number[]).reduce<number>((sum, band) => sum + band, 0) / 4;
  return Math.round(mean * 2) / 2;
}
