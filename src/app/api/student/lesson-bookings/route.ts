import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireStudent } from "@/lib/auth";
import type { AccountSession } from "@/lib/accountAuth";

const bookingSchema = z.object({
  timezone: z.string().min(1).default("Asia/Shanghai"),
  assistantId: z.string().uuid().optional().or(z.literal("")),
  bookings: z
    .array(
      z.object({
        slotId: z.string().uuid(),
        startAt: z.string().datetime(),
        courseMinutes: z.union([z.literal(60), z.literal(120)])
      })
    )
    .min(1)
    .max(5)
});

const cancelSchema = z.object({
  bookingId: z.string().uuid()
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const lessonType = getLessonType(url);
  const assistantId = url.searchParams.get("assistantId") || "";
  const auth = await requireStudent();
  if (auth instanceof Response) return auth;
  const { account, supabase } = auth;

  const slotTeacherIds = await resolveSlotTeacherIds(supabase, account, lessonType, assistantId);
  let slotsQuery = supabase
      .from("lesson_slots")
      .select("*, bookings:lesson_bookings(*)")
      .eq("is_active", true)
      .eq("lesson_type", lessonType)
      .gte("end_at", new Date().toISOString())
      .order("start_at", { ascending: true });
  if (slotTeacherIds.length) slotsQuery = slotsQuery.in("teacher_id", slotTeacherIds);
  else slotsQuery = slotsQuery.eq("teacher_id", "__none__");
  const [{ data: slots, error: slotsError }, { data: myBookings, error: bookingsError }] = await Promise.all([
    slotsQuery,
    supabase
      .from("lesson_bookings")
      .select("*, slots:lesson_slots(*)")
      .eq("student_account_id", account.id)
      .order("start_at", { ascending: true })
  ]);

  if (slotsError) return Response.json({ error: slotsError.message }, { status: 500 });
  if (bookingsError) return Response.json({ error: bookingsError.message }, { status: 500 });

  const filteredBookings = (myBookings || []).filter((booking: { slots?: { lesson_type?: string; teacher_id?: string | null } | { lesson_type?: string; teacher_id?: string | null }[] }) => {
    const slot = Array.isArray(booking.slots) ? booking.slots[0] : booking.slots;
    return (slot?.lesson_type || "regular") === lessonType && (!assistantId || slot?.teacher_id === assistantId);
  });

  return Response.json({ slots: slots || [], myBookings: filteredBookings });
}

export async function POST(request: Request) {
  const lessonType = getLessonType(new URL(request.url));
  const payload = bookingSchema.parse(await request.json());
  const auth = await requireStudent();
  if (auth instanceof Response) return auth;
  const { account, supabase } = auth;

  const slotIds = payload.bookings.map((booking) => booking.slotId);
  const slotTeacherIds = await resolveSlotTeacherIds(supabase, account, lessonType, payload.assistantId || "");

  let slotsQuery = supabase
    .from("lesson_slots")
    .select("*, bookings:lesson_bookings(*)")
    .in("id", slotIds)
    .eq("lesson_type", lessonType)
    .eq("is_active", true);
  if (slotTeacherIds.length) slotsQuery = slotsQuery.in("teacher_id", slotTeacherIds);
  else slotsQuery = slotsQuery.eq("teacher_id", "__none__");
  const { data: slots, error: slotsError } = await slotsQuery;

  if (slotsError) return Response.json({ error: slotsError.message }, { status: 500 });

  const rows: {
    slot_id: string;
    student_account_id: string;
    student_name: string;
    course_minutes: 60 | 120;
    reserved_minutes: 60 | 90 | 150;
    start_at: string;
    end_at: string;
    status: "pending";
    student_timezone: string;
  }[] = [];
  for (const booking of payload.bookings) {
    const slot = (slots || []).find((item) => item.id === booking.slotId);
    if (!slot) {
      return Response.json({ error: "有一个已选择的时间段已不可预约。" }, { status: 400 });
    }

    if (lessonType === "practice" && booking.courseMinutes !== 60) {
      return Response.json({ error: "练习课只能预约 1 小时。" }, { status: 400 });
    }
    const reservedMinutes = lessonType === "practice" ? 60 : booking.courseMinutes === 60 ? 90 : 150;
    const startAt = new Date(booking.startAt);
    const endAt = new Date(startAt.getTime() + reservedMinutes * 60 * 1000);

    if (startAt < new Date(slot.start_at) || endAt > new Date(slot.end_at)) {
      return Response.json({ error: "有一个已选择的时间段不足以安排该课程时长。" }, { status: 400 });
    }

    const activeBookings = (slot.bookings || []).filter((item: { status: string }) => item.status !== "cancelled");
    const overlapsExisting = activeBookings.some((item: { start_at: string; end_at: string }) =>
      rangesOverlap(startAt.toISOString(), endAt.toISOString(), item.start_at, item.end_at)
    );
    const overlapsPending = rows.some((item) =>
      rangesOverlap(startAt.toISOString(), endAt.toISOString(), item.start_at, item.end_at)
    );

    if (overlapsExisting || overlapsPending) {
      return Response.json({ error: "有一个已选择的课程时间与已有预约冲突。" }, { status: 409 });
    }

    rows.push({
      slot_id: booking.slotId,
      student_account_id: account.id,
      student_name: account.display_name,
      course_minutes: booking.courseMinutes,
      reserved_minutes: reservedMinutes,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      status: "pending",
      student_timezone: payload.timezone
    });
  }

  const { data, error } = await supabase.from("lesson_bookings").insert(rows).select("*");
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ bookings: data || [] });
}

export async function PATCH(request: Request) {
  const payload = cancelSchema.parse(await request.json());
  const auth = await requireStudent();
  if (auth instanceof Response) return auth;
  const { account, supabase } = auth;
  const { data: booking, error: loadError } = await supabase
    .from("lesson_bookings")
    .select("*")
    .eq("id", payload.bookingId)
    .eq("student_account_id", account.id)
    .single();

  if (loadError || !booking) {
    return Response.json({ error: "没有找到该课程预约。" }, { status: 404 });
  }
  if (booking.status === "cancelled") {
    return Response.json({ error: "这节课已经取消。" }, { status: 400 });
  }
  if (!canCancelBeforeFourHours(booking.start_at)) {
    return Response.json({ error: "课程只能在开始前至少 4 小时取消。" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("lesson_bookings")
    .update({
      status: "cancelled"
    })
    .eq("id", payload.bookingId)
    .select("*")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ booking: data });
}

function rangesOverlap(startA: string, endA: string, startB: string, endB: string) {
  return new Date(startA) < new Date(endB) && new Date(endA) > new Date(startB);
}

function canCancelBeforeFourHours(startAt: string) {
  return new Date(startAt).getTime() - Date.now() >= 4 * 60 * 60 * 1000;
}

function getLessonType(url: URL): "regular" | "practice" {
  return url.searchParams.get("lessonType") === "practice" ? "practice" : "regular";
}

async function resolveSlotTeacherIds(
  supabase: SupabaseClient,
  account: AccountSession,
  lessonType: "regular" | "practice",
  assistantId = ""
) {
  if (!account.teacher_id) return [];
  if (lessonType === "regular") return [account.teacher_id];
  if (assistantId) {
    const { data } = await supabase
      .from("accounts")
      .select("id")
      .eq("id", assistantId)
      .eq("role", "assistant")
      .eq("teacher_id", account.teacher_id)
      .maybeSingle();
    return data?.id ? [data.id] : [];
  }

  const { data } = await supabase
    .from("accounts")
    .select("id")
    .eq("role", "assistant")
    .eq("teacher_id", account.teacher_id);
  return (data || []).map((assistant) => assistant.id).filter(Boolean);
}
