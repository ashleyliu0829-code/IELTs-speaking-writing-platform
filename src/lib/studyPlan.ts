import { z } from "zod";

/**
 * A student's study plan: the phases between now and the exam, and how far
 * through them today is. Shared by the teacher's editor, the student's
 * progress card and the API that stores it.
 */

export type StudyPlanPhase = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  /** One line on what this phase is for; empty when the teacher left it out. */
  focus: string;
};

const dayPattern = /^\d{4}-\d{2}-\d{2}$/;

export const studyPlanPhaseSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(40),
  start_date: z.string().regex(dayPattern),
  end_date: z.string().regex(dayPattern),
  focus: z.string().trim().max(300).default("")
});

export const studyPlanSchema = z.array(studyPlanPhaseSchema).max(12);

/** Phases in date order, which is the only order anything shows them in. */
export function sortPhases(phases: StudyPlanPhase[]) {
  return [...phases].sort((a, b) => a.start_date.localeCompare(b.start_date) || a.end_date.localeCompare(b.end_date));
}

/** Rows straight from the database, tolerant of anything malformed. */
export function readPhases(value: unknown): StudyPlanPhase[] {
  const parsed = studyPlanSchema.safeParse(value);
  return parsed.success ? sortPhases(parsed.data) : [];
}

export type StudyPlanProgress = {
  /** 0–100 of the whole plan's days that have passed. */
  percent: number;
  totalDays: number;
  elapsedDays: number;
  /** Index into the sorted phases of the phase today falls in; -1 before the plan starts or after it ends. */
  currentIndex: number;
  /** Whether today is before the first phase, inside the plan, or past the last one. */
  state: "before" | "during" | "after";
  /** Per phase: fraction of that phase elapsed (0–1) and its share of the total plan. */
  phases: { phase: StudyPlanPhase; share: number; done: number }[];
};

export function planProgress(phasesIn: StudyPlanPhase[], today: Date): StudyPlanProgress | null {
  const phases = sortPhases(phasesIn);
  if (!phases.length) return null;
  const start = dayNumber(phases[0].start_date);
  const end = dayNumber(phases[phases.length - 1].end_date) + 1; // end date inclusive
  const now = dayNumber(today.toISOString().slice(0, 10));
  const totalDays = Math.max(1, end - start);
  const elapsedDays = Math.min(totalDays, Math.max(0, now - start));

  const perPhase = phases.map((phase) => {
    const a = dayNumber(phase.start_date);
    const b = dayNumber(phase.end_date) + 1;
    const length = Math.max(1, b - a);
    return { phase, share: length / totalDays, done: Math.min(1, Math.max(0, (now - a) / length)) };
  });

  const currentIndex = phases.findIndex((phase) => now >= dayNumber(phase.start_date) && now <= dayNumber(phase.end_date));
  const state = now < start ? "before" : now >= end ? "after" : "during";
  return { percent: Math.round((elapsedDays / totalDays) * 100), totalDays, elapsedDays, currentIndex, state, phases: perPhase };
}

/**
 * A three-phase plan from today to the exam, for the teacher to adjust:
 * the first half builds foundations, the next third is IELTS-specific
 * preparation, and the last stretch is the sprint. The names are Chinese,
 * as the teacher will edit them in the language they teach in.
 */
export function suggestPhases(today: Date, examDate: string): StudyPlanPhase[] {
  const start = dayNumber(today.toISOString().slice(0, 10));
  const end = dayNumber(examDate);
  if (end <= start) return [];
  const total = end - start;
  const cutA = start + Math.max(1, Math.round(total * 0.4));
  const cutB = start + Math.max(cutA - start + 1, Math.round(total * 0.75));
  const stamp = Date.now().toString(36);
  const phase = (index: number, name: string, from: number, to: number, focus: string): StudyPlanPhase => ({
    id: `${stamp}-${index}`,
    name,
    start_date: dayString(from),
    end_date: dayString(to),
    focus
  });
  return [
    phase(1, "基础提升", start, cutA - 1, "补语法和词汇的底子，建立口语和写作的基本表达习惯"),
    phase(2, "雅思备考", cutA, cutB - 1, "按题型系统训练听说读写，熟悉评分标准"),
    phase(3, "考前冲刺", cutB, end, "整套模考、限时练习、查漏补缺")
  ];
}

function dayNumber(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

function dayString(dayNo: number) {
  return new Date(dayNo * 86400000).toISOString().slice(0, 10);
}
