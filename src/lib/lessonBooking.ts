export type BookingType = "trial" | "regular" | "practice";
export type CourseMinutes = 60 | 120;

/**
 * How long a lesson blocks the calendar.
 *
 * A regular lesson reserves half an hour beyond the teaching time. A trial does
 * not: it is a single hour, start to finish. Assistant practice lessons are the
 * same shape as a trial.
 *
 * Both the student booking route and the teacher's direct scheduling route go
 * through here, so the two cannot drift apart and disagree about when a slot is
 * free.
 */
export function reservedMinutesFor(bookingType: BookingType, courseMinutes: CourseMinutes) {
  if (bookingType === "trial" || bookingType === "practice") return 60;
  return courseMinutes === 120 ? 150 : 90;
}

/** Trials and practice lessons are always a single hour of teaching. */
export function courseMinutesFor(bookingType: BookingType, requested: CourseMinutes): CourseMinutes {
  return bookingType === "regular" ? requested : 60;
}

export function bookingTypeLabel(bookingType: BookingType, language: "zh" | "en" = "zh") {
  const labels: Record<BookingType, { zh: string; en: string }> = {
    trial: { zh: "试课", en: "Trial" },
    regular: { zh: "正式课", en: "Lesson" },
    practice: { zh: "练习课", en: "Practice" }
  };
  return labels[bookingType]?.[language] || labels.regular[language];
}
