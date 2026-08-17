import { NextRequest } from "next/server";
import { z } from "zod";
import { requireTeacher } from "@/lib/auth";
import { defaultAssignment } from "@/lib/questions";

const assignmentSchema = z.object({
  id: z.string().uuid().optional(),
  assignment_type: z.enum(["speaking", "writing"]).default("speaking"),
  title: z.string().min(1),
  deadline_text: z.string().default(""),
  due_date: z.string().nullable().optional(),
  p1_questions: z.array(z.string()).transform(cleanQuestions).default([]),
  p2_prompt: z.string().default(""),
  p3_questions: z.array(z.string()).transform(cleanQuestions).default([]),
  writing_tasks: z
    .array(
      z.object({
        key: z.string().min(1),
        label: z.string().min(1),
        title: z.string().min(1),
        prompt: z.string().default(""),
        word_limit: z.string().default(""),
        task1_type: z.string().optional().default(""),
        task2_type: z.string().optional().default(""),
        topic: z.string().optional().default(""),
        image_urls: z.array(z.string()).default([])
      })
    )
    .default([]),
  training_note: z.string().min(1),
  assigned_students: z.array(z.string()).transform(cleanStudents).default([]),
  is_active: z.boolean().default(true)
}).superRefine((assignment, ctx) => {
  if (assignment.assignment_type === "speaking") {
    if (!assignment.p1_questions.length) {
      ctx.addIssue({ code: "custom", path: ["p1_questions"], message: "Add at least one Part 1 question." });
    }
    if (!assignment.p2_prompt.trim()) {
      ctx.addIssue({ code: "custom", path: ["p2_prompt"], message: "Add a Part 2 cue card." });
    }
    if (!assignment.p3_questions.length) {
      ctx.addIssue({ code: "custom", path: ["p3_questions"], message: "Add at least one Part 3 question." });
    }
  }
  if (assignment.assignment_type === "writing" && !assignment.writing_tasks.length) {
    ctx.addIssue({ code: "custom", path: ["writing_tasks"], message: "Add at least one writing task." });
  }
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
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;
  const { supabase } = auth;

  const assignmentType = request.nextUrl.searchParams.get("assignmentType");
  let query = supabase.from("assignments").select("*").eq("is_active", true).order("created_at", { ascending: false });
  if (assignmentType === "speaking" || assignmentType === "writing") {
    query = query.eq("assignment_type", assignmentType);
  }
  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ assignments: data || [], defaultAssignment });
}

export async function POST(request: NextRequest) {
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;
  const { account: teacher, supabase } = auth;

  const payload = assignmentSchema.parse(await request.json());
  if (!payload.deadline_text && payload.due_date) {
    payload.deadline_text = payload.due_date;
  }
  const row = { ...payload, teacher_id: teacher.id };

  const query = payload.id
    ? supabase.from("assignments").update(row).eq("id", payload.id).select("*").single()
    : supabase.from("assignments").insert(row).select("*").single();

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ assignment: data });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;
  const { supabase } = auth;

  const assignmentId = request.nextUrl.searchParams.get("assignmentId");
  if (!assignmentId) {
    return Response.json({ error: "Missing assignmentId." }, { status: 400 });
  }

  const { error } = await supabase
    .from("assignments")
    .update({ is_active: false })
    .eq("id", assignmentId);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
