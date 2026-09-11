import { NextRequest } from "next/server";
import { z } from "zod";
import { requireTeacher } from "@/lib/auth";
import type { LessonBooking } from "@/lib/types";

/**
 * One student's lessons in order, and the teacher's notes on each.
 *
 * A lesson is a booking that was not cancelled; the progress fields sit on
 * the booking row (see the 20260913 migration), so the list is one query and
 * an edit is one update. Ordering is by start time, so the row number on the
 * page is the lesson number.
 */

const sections = ["Speaking", "Listening", "Reading", "Writing", "Mock", "Trial"] as const;

const updateSchema = z.object({
  bookingId: z.string().uuid(),
  topic: z.string().max(4000).optional(),
  material: z.string().max(300).optional(),
  sections: z.array(z.enum(sections)).optional(),
  note: z.string().max(4000).optional(),
  completed: z.boolean().optional()
});

const columns =
  "id, slot_id, student_account_id, student_name, course_minutes, reserved_minutes, booking_type, start_at, end_at, status, student_timezone, lesson_topic, lesson_material, lesson_sections, lesson_note, completed_at, lesson_slots!inner(teacher_id)";

export async function GET(request: NextRequest) {
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;
  const { account, supabase } = auth;

  const studentName = request.nextUrl.searchParams.get("studentName")?.trim() || "";
  if (!studentName) return Response.json({ error: "Missing studentName." }, { status: 400 });

  const { data, error } = await supabase
    .from("lesson_bookings")
    .select(columns)
    .eq("lesson_slots.teacher_id", account.id)
    .neq("status", "cancelled")
    .ilike("student_name", studentName)
    .order("start_at", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const lessons = (data || []).map((row) => {
    const { lesson_slots: _slots, ...booking } = row as unknown as LessonBooking & { lesson_slots: unknown };
    return booking;
  });
  return Response.json({ lessons });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;
  const { account, supabase } = auth;

  const parsed = updateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Invalid lesson update." }, { status: 400 });
  const { bookingId, topic, material, sections: lessonSections, note, completed } = parsed.data;

  // Ownership goes through the slot, as everywhere else for bookings.
  const { data: owned, error: lookupError } = await supabase
    .from("lesson_bookings")
    .select("id, lesson_slots!inner(teacher_id)")
    .eq("id", bookingId)
    .eq("lesson_slots.teacher_id", account.id)
    .maybeSingle();
  if (lookupError) return Response.json({ error: lookupError.message }, { status: 500 });
  if (!owned) return Response.json({ error: "Lesson not found." }, { status: 404 });

  const patch: Record<string, unknown> = {};
  if (topic !== undefined) patch.lesson_topic = topic.trim();
  if (material !== undefined) patch.lesson_material = material.trim();
  if (lessonSections !== undefined) patch.lesson_sections = lessonSections;
  if (note !== undefined) patch.lesson_note = note.trim();
  if (completed !== undefined) patch.completed_at = completed ? new Date().toISOString() : null;
  if (!Object.keys(patch).length) return Response.json({ error: "Nothing to change." }, { status: 400 });

  const { data, error } = await supabase
    .from("lesson_bookings")
    .update(patch)
    .eq("id", bookingId)
    .select("id, lesson_topic, lesson_material, lesson_sections, lesson_note, completed_at")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ lesson: data });
}
