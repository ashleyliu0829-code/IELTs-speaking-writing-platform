import { NextRequest } from "next/server";
import { z } from "zod";
import { requireTeacher } from "@/lib/auth";

const payloadSchema = z.object({
  responseId: z.string().uuid(),
  teacherRevisionText: z.string()
});

export async function PATCH(request: NextRequest) {
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;
  const { supabase } = auth;

  const payload = payloadSchema.parse(await request.json());
  // RLS reaches writing_responses through its submission, so a miss means "not yours".
  const { data: response } = await supabase
    .from("writing_responses")
    .select("id")
    .eq("id", payload.responseId)
    .maybeSingle();
  if (!response) return Response.json({ error: "Writing response not found." }, { status: 404 });

  const { data, error } = await supabase
    .from("writing_responses")
    .update({
      teacher_revision_text: payload.teacherRevisionText,
      updated_at: new Date().toISOString()
    })
    .eq("id", payload.responseId)
    .select("*")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ writingResponse: data });
}
