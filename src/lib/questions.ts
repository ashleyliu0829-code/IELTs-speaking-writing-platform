import type { Assignment, FeedbackDetail, QuestionItem } from "@/lib/types";

export const defaultTrainingNote =
  "Browse all topics first. Think about your own stories and examples, check expressions you are unsure about, practise until you can speak smoothly, then record your answers.";

export const defaultAssignment: Omit<Assignment, "id"> = {
  title: "7/12 IELTS Speaking Lesson 1 Pre-class Homework",
  deadline_text: "2026-07-12 before class",
  p1_questions: [
    "Do you work or study?",
    "What subject are you studying?",
    "Why did you choose this subject?",
    "Do you prefer studying in the morning or in the evening?"
  ],
  p2_prompt:
    "Describe a skill you would like to learn.\n\nYou should say:\n- what the skill is\n- why you want to learn it\n- how you would learn it\n- and explain how this skill would help you in the future.",
  p3_questions: [
    "Why do people need to keep learning new skills?",
    "Is it easier for children or adults to learn a new skill?",
    "Should schools teach more practical skills?",
    "How has technology changed the way people learn?"
  ],
  training_note: defaultTrainingNote,
  assigned_students: [],
  is_active: true
};

export function getQuestionItems(assignment: Assignment): QuestionItem[] {
  return [
    ...assignment.p1_questions.map((question, index) => ({
      key: `p1q${index + 1}`,
      part: "p1" as const,
      label: `Part 1 Question ${index + 1}`,
      question
    })),
    {
      key: "p2",
      part: "p2" as const,
      label: "Part 2 Cue Card",
      question: assignment.p2_prompt
    },
    ...assignment.p3_questions.map((question, index) => ({
      key: `p3q${index + 1}`,
      part: "p3" as const,
      label: `Part 3 Question ${index + 1}`,
      question
    }))
  ];
}

export function averageScore(details: Array<Pick<FeedbackDetail, "score">>) {
  if (!details.length) return 0;
  const total = details.reduce((sum, detail) => sum + Number(detail.score || 0), 0);
  return Math.round((total / details.length) * 10) / 10;
}
