import { requireTeacher } from "@/lib/auth";
import type { TeacherHomeActivity, TeacherHomeLesson } from "@/lib/types";

/**
 * What the teacher's home page shows: the lessons coming up, and what the
 * students have done lately.
 *
 * The schedule here is deliberately not the scheduling page. That page is for
 * publishing availability, so it has to show empty slots; this one answers
 * "what am I teaching next", so a slot nobody booked is noise and is left out.
 */

const lessonLimit = 8;
const activityLimit = 12;

type SlotRef = { teacher_id: string | null } | { teacher_id: string | null }[] | null;

type BookingRow = {
  id: string;
  student_name: string;
  start_at: string;
  end_at: string;
  status: string;
  booking_type: string | null;
  course_minutes: number | null;
  created_at: string;
  cancelled_at: string | null;
  cancelled_by: string | null;
  lesson_slots: SlotRef;
};

type SubmissionRow = {
  id: string;
  student_name: string;
  submitted_at: string;
  assignments: { title: string | null; assignment_type: string | null } | { title: string | null; assignment_type: string | null }[] | null;
};

export async function GET() {
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;
  const { account, supabase } = auth;

  const now = new Date();
  // Enough history for the feed to be full without scanning the whole table.
  const since = new Date(now.getTime() - 30 * 86400000).toISOString();

  const [upcoming, submissions, recentBookings, newStudents] = await Promise.all([
    supabase
      .from("lesson_bookings")
      .select("id, student_name, start_at, end_at, status, booking_type, course_minutes, created_at, cancelled_at, cancelled_by, lesson_slots!inner(teacher_id)")
      .eq("lesson_slots.teacher_id", account.id)
      .in("status", ["pending", "confirmed"])
      .gte("start_at", now.toISOString())
      .order("start_at", { ascending: true })
      .limit(lessonLimit),
    supabase
      .from("submissions")
      .select("id, student_name, submitted_at, assignments(title, assignment_type)")
      .in("submission_status", ["submitted", "reviewed"])
      .gte("submitted_at", since)
      .order("submitted_at", { ascending: false })
      .limit(activityLimit),
    supabase
      .from("lesson_bookings")
      .select("id, student_name, start_at, end_at, status, booking_type, course_minutes, created_at, cancelled_at, cancelled_by, lesson_slots!inner(teacher_id)")
      .eq("lesson_slots.teacher_id", account.id)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(activityLimit),
    supabase
      .from("accounts")
      .select("id, display_name, created_at")
      .eq("role", "student")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(activityLimit)
  ]);

  const failure = [upcoming, submissions, recentBookings, newStudents].find((result) => result.error);
  if (failure?.error) return Response.json({ error: failure.error.message }, { status: 500 });

  const lessons: TeacherHomeLesson[] = ((upcoming.data || []) as unknown as BookingRow[]).map((row) => ({
    id: row.id,
    student_name: row.student_name,
    start_at: row.start_at,
    end_at: row.end_at,
    status: row.status === "confirmed" ? "confirmed" : "pending",
    booking_type: row.booking_type || "regular",
    course_minutes: Number(row.course_minutes || 0)
  }));

  const activity: TeacherHomeActivity[] = [];

  ((submissions.data || []) as unknown as SubmissionRow[]).forEach((row) => {
    const assignment = one(row.assignments);
    activity.push({
      id: `submission:${row.id}`,
      kind: "submission",
      student_name: row.student_name,
      at: row.submitted_at,
      title: assignment?.title || "作业",
      area: (assignment?.assignment_type || "speaking") === "writing" ? "writing" : "speaking"
    });
  });

  ((recentBookings.data || []) as unknown as BookingRow[]).forEach((row) => {
    // A student cancelling is news the teacher has to act on; the teacher's own
    // cancellation is something they already know about.
    if (row.status === "cancelled") {
      if (row.cancelled_by !== "student") return;
      activity.push({
        id: `cancelled:${row.id}`,
        kind: "booking_cancelled",
        student_name: row.student_name,
        at: row.cancelled_at || row.created_at,
        lesson_at: row.start_at
      });
      return;
    }

    // Only a pending booking is certainly the student's doing — a confirmed one
    // may be a lesson the teacher scheduled herself, so it is reported as a
    // lesson being booked rather than as something the student did.
    activity.push({
      id: `booking:${row.id}`,
      kind: row.status === "pending" ? "booking_pending" : "booking_confirmed",
      student_name: row.student_name,
      at: row.created_at,
      lesson_at: row.start_at,
      booking_type: row.booking_type || "regular"
    });
  });

  (newStudents.data || []).forEach((row) => {
    activity.push({
      id: `student:${row.id}`,
      kind: "student_joined",
      student_name: (row.display_name as string) || "新学生",
      at: row.created_at as string
    });
  });

  activity.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  return Response.json({ lessons, activity: activity.slice(0, activityLimit) });
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}
