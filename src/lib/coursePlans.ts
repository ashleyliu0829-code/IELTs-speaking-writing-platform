/**
 * The courses a student can be on.
 *
 * Kept here rather than in a database enum because the list is a commercial
 * decision — it will change when the teacher starts selling something new, and
 * that should not need a migration. The column stores whatever string was
 * chosen; this list is what the picker offers and what the server accepts.
 */
export const coursePlans = [
  "全科冲刺",
  "基础提升",
  "全程陪跑",
  "单科冲刺（口语）",
  "单科冲刺（写作）",
  "单科冲刺（阅读）",
  "单科冲刺（听力）",
  "单科提升（口语）",
  "单科提升（写作）",
  "单科提升（阅读）",
  "单科提升（听力）"
] as const;

export type CoursePlan = (typeof coursePlans)[number];

export function isCoursePlan(value: string): value is CoursePlan {
  return (coursePlans as readonly string[]).includes(value);
}

/**
 * The family a plan belongs to, for colouring: the five kinds the teacher
 * sells, each with its own tint on the roster so a glance down the column
 * says who is on what.
 */
export type CoursePlanFamily = "sprint-all" | "foundation" | "companion" | "sprint-one" | "boost-one";

export function coursePlanFamily(plan: string): CoursePlanFamily | null {
  if (!plan) return null;
  if (plan === "全科冲刺") return "sprint-all";
  if (plan === "基础提升") return "foundation";
  if (plan === "全程陪跑") return "companion";
  if (plan.startsWith("单科冲刺")) return "sprint-one";
  if (plan.startsWith("单科提升")) return "boost-one";
  return null;
}

/**
 * Which skills a plan covers, for deciding which progress curves a student
 * sees. A single-skill plan names its skill; everything else — the whole-
 * course plans and "not set" — shows both. Reading and listening have no
 * homework on this platform, so a plan for those alone shows neither.
 */
export function coursePlanAreas(plan: string): Array<"speaking" | "writing"> {
  if (plan.startsWith("单科")) {
    if (plan.includes("口语")) return ["speaking"];
    if (plan.includes("写作")) return ["writing"];
    return [];
  }
  return ["speaking", "writing"];
}
