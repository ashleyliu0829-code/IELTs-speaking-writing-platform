import { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentAccount } from "@/lib/accountAuth";
import { getSupabaseForAccount } from "@/lib/supabase";

/**
 * Lessons the teacher schedules directly, rather than ones a student requested.
 *
 * A student booking starts as `pending` and waits for the teacher; one created
 * here is already the teacher's decision, so it is written as `confirmed`. It
 * occupies the time exactly like any other booking, which is what makes it
 * visible as unavailable to the rest of the students.
 */

const createSchema = z.object({
  studentName: z.string().min(1),
  studentAccountId: z.string().uuid().optional().or(z.literal("")),
  startAt: z.string().datetime(),
  courseMinutes: z.union([z.literal(60), z.literal(120)]),
  timezone: z.string().min(1).default("Asia/Shanghai"),
  note: z.string().optional().default("")
});

export async function POST(request: NextRequest) {
  const account = await getCurrentAccount();
  if (account?.role !== "teacher" && account?.role !== "assistant") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const lessonType = request.nextUrl.searchParams.get("lessonType") === "practice" ? "practice" : "regular";
  if (lessonType === "practice" && account.role !== "assistant") {
    return Response.json({ error: "练习课时段由助教管理。" }, { status: 403 });
  }
  if (lessonType === "regular" && account.role !== "teacher") {
    return Response.json({ error: "正课时段由老师管理。" }, { status: 403 });
  }

  const payload = createSchema.parse(await request.json());
  if (lessonType === "practice" && payload.courseMinutes !== 60) {
    return Response.json({ error: "练习课只能安排 1 小时。" }, { status: 400 });
  }

  // Matches the student booking rules: an hour of teaching reserves 90 minutes.
  const reservedMinutes = lessonType === "practice" ? 60 : payload.courseMinutes === 60 ? 90 : 150;
  const startAt = new Date(payload.startAt);
  const endAt = new Date(startAt.getTime() + reservedMinutes * 60 * 1000);
  const supabase = getSupabaseForAccount(account);

  // Slots own the bookings, so a directly scheduled lesson still needs one.
  // Reuse a slot that already covers this time rather than fragmenting the
  // calendar with a new window for every lesson.
  const { data: coveringSlots, error: slotsError } = await supabase
    .from("lesson_slots")
    .select("id, start_at, end_at")
    .eq("teacher_id", account.id)
    .eq("lesson_type", lessonType)
    .eq("is_active", true)
    .lte("start_at", startAt.toISOString())
    .gte("end_at", endAt.toISOString())
    .order("start_at", { ascending: true })
    .limit(1);

  if (slotsError) return Response.json({ error: slotsError.message }, { status: 500 });

  let slotId = coveringSlots?.[0]?.id as string | undefined;
  if (!slotId) {
    const { data: createdSlot, error: createSlotError } = await supabase
      .from("lesson_slots")
      .insert({
        teacher_id: account.id,
        lesson_type: lessonType,
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        timezone: payload.timezone,
        note: payload.note
      })
      .select("id")
      .single();

    if (createSlotError || !createdSlot) {
      return Response.json({ error: createSlotError?.message || "无法创建课程时段。" }, { status: 500 });
    }
    slotId = createdSlot.id;
  }

  const conflict = await findConflict(supabase, account.id, lessonType, startAt, endAt);
  if (conflict) {
    return Response.json({ error: `这个时间和已有课程冲突（${conflict}）。` }, { status: 409 });
  }

  const { data: booking, error } = await supabase
    .from("lesson_bookings")
    .insert({
      slot_id: slotId,
      student_account_id: payload.studentAccountId || null,
      student_name: payload.studentName.trim(),
      course_minutes: payload.courseMinutes,
      reserved_minutes: reservedMinutes,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      status: "confirmed",
      student_timezone: payload.timezone
    })
    .select("*")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ booking });
}

/**
 * Conflicts are checked across every slot the teacher owns, not just the one
 * this lesson lands in: overlapping slots would otherwise let two lessons be
 * scheduled at the same moment.
 */
async function findConflict(
  supabase: ReturnType<typeof getSupabaseForAccount>,
  teacherId: string,
  lessonType: string,
  startAt: Date,
  endAt: Date
) {
  const { data } = await supabase
    .from("lesson_bookings")
    .select("start_at, end_at, student_name, slots:lesson_slots!inner(teacher_id, lesson_type)")
    .neq("status", "cancelled")
    .eq("slots.teacher_id", teacherId)
    .eq("slots.lesson_type", lessonType)
    .lt("start_at", endAt.toISOString())
    .gt("end_at", startAt.toISOString())
    .limit(1);

  const clash = data?.[0] as { student_name?: string } | undefined;
  return clash ? clash.student_name || "已有预约" : null;
}
