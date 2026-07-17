import { NextRequest } from "next/server";
import { z } from "zod";
import { requireTeacher } from "@/lib/auth";
import { defaultAssignment } from "@/lib/questions";
import { getSupabaseAdmin } from "@/lib/supabase";

const assignmentSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1),
  deadline_text: z.string().min(1),
  p1_questions: z.array(z.string()).transform(cleanQuestions).pipe(z.array(z.string().min(1)).min(1)),
  p2_prompt: z.string().min(1),
  p3_questions: z.array(z.string()).transform(cleanQuestions).pipe(z.array(z.string().min(1)).min(1)),
  training_note: z.string().min(1),
  assigned_students: z.array(z.string()).transform(cleanStudents).default([]),
  is_active: z.boolean().default(true)
});

function cleanQuestions(values: string[]) {
  return values.map((value) => value.trim()).filter(Boolean);
}

function cleanStudents(values: string[]) {
  const seen = new Set<string>();
  const students: string[] = [];
  values.forEach((value) => {
    const student = value.trim();
    const key = normalizeStudentName(student);
    if (student && !seen.has(key)) {
      seen.add(key);
      students.push(student);
    }
  });
  return students;
}

function normalizeStudentName(value: string) {
  return value.trim().toLowerCase();
}

export async function GET(request: NextRequest) {
  const unauthorized = requireTeacher(request);
  if (unauthorized) return unauthorized;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("assignments").select("*").order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ assignments: data || [], defaultAssignment });
}

export async function POST(request: NextRequest) {
  const unauthorized = requireTeacher(request);
  if (unauthorized) return unauthorized;

  const payload = assignmentSchema.parse(await request.json());
  const supabase = getSupabaseAdmin();

  const query = payload.id
    ? supabase.from("assignments").update(payload).eq("id", payload.id).select("*").single()
    : supabase.from("assignments").insert(payload).select("*").single();

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ assignment: data });
}
