import { NextRequest } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireTeacher } from "@/lib/auth";
import type { Assignment, LessonRecord } from "@/lib/types";

const lessonSections = ["Speaking", "Listening", "Reading", "Writing"] as const;

const lessonRecordSchema = z.object({
  studentName: z.string().min(1),
  lessonAt: z.string().min(1),
  sections: z.array(z.enum(lessonSections)).min(1),
  durationMinutes: z.number().int().min(1),
  preHomeworkAssignmentIds: z.array(z.string().uuid()).default([]),
  postHomeworkAssignmentIds: z.array(z.string().uuid()).default([]),
  preparationNote: z.string().optional().default(""),
  homeworkNote: z.string().optional().default("")
});

export async function GET(request: NextRequest) {
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;
  const { supabase } = auth;

  const studentName = request.nextUrl.searchParams.get("studentName")?.trim();
  let query = supabase.from("lesson_records").select("*").order("lesson_at", { ascending: false });
  if (studentName) query = query.eq("student_name", studentName);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const records = await attachHomework((data || []) as LessonRecord[], supabase);
  return Response.json({ records });
}

export async function POST(request: NextRequest) {
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;
  const { account: teacher, supabase } = auth;

  const payload = lessonRecordSchema.parse(await request.json());
  const { data, error } = await supabase
    .from("lesson_records")
    .insert({
      student_name: payload.studentName.trim(),
      teacher_id: teacher.id,
      lesson_at: payload.lessonAt,
      sections: payload.sections,
      duration_minutes: payload.durationMinutes,
      pre_homework_assignment_ids: payload.preHomeworkAssignmentIds,
      post_homework_assignment_ids: payload.postHomeworkAssignmentIds,
      preparation_note: payload.preparationNote.trim(),
      homework_note: payload.homeworkNote.trim()
    })
    .select("*")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  const [record] = await attachHomework([data as LessonRecord], supabase);
  return Response.json({ record });
}

async function attachHomework(records: LessonRecord[], supabase: SupabaseClient) {
  const ids = Array.from(
    new Set(records.flatMap((record) => [...(record.pre_homework_assignment_ids || []), ...(record.post_homework_assignment_ids || [])]))
  );
  if (!ids.length) return records.map((record) => ({ ...record, pre_homework: [], post_homework: [] }));

  const { data } = await supabase.from("assignments").select("*").in("id", ids);
  const assignments = ((data || []) as Assignment[]).reduce<Record<string, Assignment>>((map, assignment) => {
    map[assignment.id] = assignment;
    return map;
  }, {});

  return records.map((record) => ({
    ...record,
    pre_homework: (record.pre_homework_assignment_ids || []).map((id) => assignments[id]).filter(Boolean),
    post_homework: (record.post_homework_assignment_ids || []).map((id) => assignments[id]).filter(Boolean)
  }));
}
