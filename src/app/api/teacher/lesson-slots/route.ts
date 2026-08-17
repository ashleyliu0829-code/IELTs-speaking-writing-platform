import { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentAccount } from "@/lib/accountAuth";
import { getSupabaseForAccount } from "@/lib/supabase";

const slotSchema = z.object({
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  timezone: z.string().min(1).default("Asia/Shanghai"),
  note: z.string().optional().default("")
});

const bookingActionSchema = z.object({
  bookingId: z.string().uuid(),
  action: z.enum(["confirm", "cancel"]),
  teacherSuggestedTime: z.string().optional().default("")
});

export async function GET(request: NextRequest) {
  const account = await getLessonOwner(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const lessonType = getLessonType(request);

  const supabase = getSupabaseForAccount(account);
  let query = supabase
    .from("lesson_slots")
    .select("*, bookings:lesson_bookings(*)")
    .eq("is_active", true)
    .eq("lesson_type", lessonType)
    .order("start_at", { ascending: true });
  query = query.eq("teacher_id", account.id);
  const { data, error } = await query;

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ slots: data || [] });
}

export async function POST(request: NextRequest) {
  const account = await getLessonOwner(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const lessonType = getLessonType(request);

  const payload = slotSchema.parse(await request.json());
  const startAt = new Date(payload.startAt);
  const endAt = new Date(payload.endAt);

  if (endAt <= startAt) {
    return Response.json({ error: "End time must be after start time." }, { status: 400 });
  }

  const supabase = getSupabaseForAccount(account);
  const { data, error } = await supabase
    .from("lesson_slots")
    .insert({
      teacher_id: account.id,
      lesson_type: lessonType,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      timezone: payload.timezone,
      note: payload.note
    })
    .select("*")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ slot: data });
}

export async function DELETE(request: NextRequest) {
  const account = await getLessonOwner(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const lessonType = getLessonType(request);

  const slotId = request.nextUrl.searchParams.get("slotId");
  if (!slotId) return Response.json({ error: "Missing slotId." }, { status: 400 });

  const supabase = getSupabaseForAccount(account);
  const query = supabase.from("lesson_slots").update({ is_active: false }).eq("id", slotId).eq("teacher_id", account.id).eq("lesson_type", lessonType);
  const { error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}

export async function PATCH(request: NextRequest) {
  const account = await getLessonOwner(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const lessonType = getLessonType(request);

  const payload = bookingActionSchema.parse(await request.json());
  const supabase = getSupabaseForAccount(account);

  const { data: booking, error: loadError } = await supabase
    .from("lesson_bookings")
    .select("*, slots:lesson_slots(teacher_id, lesson_type)")
    .eq("id", payload.bookingId)
    .single();

  if (loadError || !booking) {
    return Response.json({ error: "Booking not found." }, { status: 404 });
  }
  if (booking.status === "cancelled") {
    return Response.json({ error: "This booking has already been cancelled." }, { status: 400 });
  }
  const slot = Array.isArray(booking.slots) ? booking.slots[0] : booking.slots;
  if (slot?.teacher_id !== account.id || (slot?.lesson_type || "regular") !== lessonType) {
    return Response.json({ error: "Booking not found." }, { status: 404 });
  }

  if (payload.action === "confirm") {
    const { data, error } = await supabase
      .from("lesson_bookings")
      .update({ status: "confirmed" })
      .eq("id", payload.bookingId)
      .select("*")
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ booking: data });
  }

  if (!canCancelBeforeFourHours(booking.start_at)) {
    return Response.json({ error: "Lessons can only be cancelled at least 4 hours before the start time." }, { status: 400 });
  }
  if (!payload.teacherSuggestedTime.trim()) {
    return Response.json({ error: "Please suggest another time slot before cancelling." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("lesson_bookings")
    .update({
      status: "cancelled",
      teacher_suggested_time: payload.teacherSuggestedTime.trim()
    })
    .eq("id", payload.bookingId)
    .select("*")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ booking: data });
}

function canCancelBeforeFourHours(startAt: string) {
  return new Date(startAt).getTime() - Date.now() >= 4 * 60 * 60 * 1000;
}

function getLessonType(request: NextRequest): "regular" | "practice" {
  return request.nextUrl.searchParams.get("lessonType") === "practice" ? "practice" : "regular";
}

async function getLessonOwner(request: NextRequest) {
  const account = await getCurrentAccount();
  const lessonType = getLessonType(request);
  if (lessonType === "practice") return account?.role === "assistant" ? account : null;
  return account?.role === "teacher" ? account : null;
}
