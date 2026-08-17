import { NextRequest } from "next/server";
import { requireStudent } from "@/lib/auth";
import type { Assignment } from "@/lib/types";

export async function GET(request: NextRequest) {
  const auth = await requireStudent();
  if (auth instanceof Response) return auth;

  const studentName = request.nextUrl.searchParams.get("studentName")?.trim() || "";
  const { data, error } = await auth.supabase
    .from("assignments")
    .select("id, title, deadline_text, due_date, assignment_type, p1_questions, p2_prompt, assigned_students, created_at")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const assignments = ((data || []) as Pick<Assignment, "id" | "title" | "deadline_text" | "due_date" | "assignment_type" | "p1_questions" | "p2_prompt" | "assigned_students" | "created_at">[])
    .filter((assignment) => canStudentSeeAssignment(studentName, assignment.assigned_students || []))
    .map(({ assigned_students: _assignedStudents, ...assignment }) => assignment);

  return Response.json({ assignments });
}

function canStudentSeeAssignment(studentName: string, assignedStudents: string[]) {
  if (!assignedStudents.length) return true;
  const normalizedStudent = normalizeStudentName(studentName);
  if (!normalizedStudent) return false;
  return assignedStudents.some((student) => normalizeStudentName(student) === normalizedStudent);
}

function normalizeStudentName(value: string) {
  return value.trim().toLowerCase();
}
